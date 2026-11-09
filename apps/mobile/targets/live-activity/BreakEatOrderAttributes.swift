import ActivityKit
import Foundation

/// Contrat de données de la Live Activity « suivi de commande ».
///
/// ⚠️ `ContentState` doit rester STRICTEMENT aligné sur le `LiveActivityContentState`
/// du backend (`backend/src/modules/live-activity/live-activity.service.ts`).
/// iOS ignore silencieusement une mise à jour APNs dont la charge utile ne se
/// décode pas : une clé renommée d'un côté sans l'autre se traduit par une
/// Live Activity qui « ne bouge plus », sans erreur visible.
///
/// Les dates transitent en ISO 8601 (String) plutôt qu'en `Date` : le décodage
/// JSON d'APNs n'applique pas notre stratégie de date, et une chaîne reste
/// lisible telle quelle dans les journaux en cas de problème.
struct BreakEatOrderAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// CREATED | PREPARING | READY | DELAYED | COLLECTED | CANCELLED
    var status: String
    /// Libellé déjà traduit par le serveur — l'extension n'invente aucun texte,
    /// ce qui garantit un vocabulaire identique dans l'app et sur l'écran verrouillé.
    var statusLabel: String
    var orderNumber: String
    var pickupPoint: String?
    var estimatedReadyAt: String?
    var slotStartAt: String?
    var slotEndAt: String?
    var updatedAt: String
    /// Le client a-t-il annonce sa presence au comptoir ?
    ///
    /// OPTIONNEL a dessein : une activite demarree par une version anterieure de
    /// l'app, ou une charge utile plus ancienne, ne porte pas cette cle. Un champ
    /// obligatoire ferait echouer le decodage — et iOS ignore SILENCIEUSEMENT une
    /// mise a jour qui ne se decode pas : l'activite paraitrait simplement figee.
    var customerArrived: Bool?
    /// Produits que le comptoir n'a pas pu servir, prêts à afficher (« 1× Bière »).
    ///
    /// OPTIONNEL pour la même raison que `customerArrived` : une charge utile
    /// sans cette clé doit continuer de se décoder.
    var missingItems: [String]?
  }

  /// Identifiant de la commande suivie. Fixe pendant toute la vie de l'activité.
  var orderId: String
}

// MARK: - Confort d'affichage

extension BreakEatOrderAttributes.ContentState {
  /// Étapes visibles par le client (les statuts terminaux n'en font pas partie).
  static let steps = ["CREATED", "PREPARING", "READY"]

  /// Index de l'étape courante ; -1 pour un statut hors parcours (annulée).
  var stepIndex: Int {
    Self.steps.firstIndex(of: status) ?? (status == "COLLECTED" ? Self.steps.count - 1 : -1)
  }

  var isReady: Bool { status == "READY" }
  var hasArrived: Bool { customerArrived == true }

  /// Le client peut-il signaler sa presence ? Uniquement quand la commande
  /// l'attend au comptoir et qu'il ne l'a pas deja fait.
  var canAnnounceArrival: Bool { isReady && !hasArrived }
  var isCancelled: Bool { status == "CANCELLED" }
  var isFinished: Bool { status == "COLLECTED" || status == "CANCELLED" }

  /// Le comptoir a signalé un produit manquant, et la commande est en cours :
  /// une fois récupérée ou annulée, le manque n'appelle plus aucun geste.
  var hasMissingItems: Bool { !(missingItems ?? []).isEmpty && !isFinished }

  /// « 1× Bière, 1× Frites ».
  var missingSummary: String { (missingItems ?? []).joined(separator: ", ") }

  /// Lit une date ISO 8601, avec ou sans millisecondes (le serveur en met,
  /// une charge utile écrite à la main n'en a pas forcément).
  static func parseDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return iso.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  /// L'heure que vise le DÉCOMPTE, ou nil s'il n'y en a pas.
  ///
  /// ⚠️ Même règle que `cibleDuDecompte` côté serveur
  /// (`backend/src/modules/live-activity/peremption.ts`) : le serveur y place
  /// la date de péremption, et c'est elle qui fait basculer l'affichage quand
  /// le chrono arrive à zéro. Deux règles différentes laisseraient un chrono
  /// figé à « 0:00 ».
  ///
  /// L'estimation prime sur le créneau. Pas de décompte une fois prête,
  /// terminée, ou avec un produit manquant : le client n'attend plus une
  /// heure, il a quelque chose à faire.
  var countdownTarget: Date? {
    guard status == "CREATED" || status == "PREPARING" || status == "DELAYED" else { return nil }
    guard !hasMissingItems else { return nil }
    return Self.parseDate(estimatedReadyAt) ?? Self.parseDate(slotStartAt)
  }

  /// Heure de retrait à afficher : l'estimation prime (recalculée par Flaix),
  /// sinon le début du créneau. Nil quand aucune information n'est disponible.
  var pickupTimeLabel: String? {
    guard let date = Self.parseDate(estimatedReadyAt) ?? Self.parseDate(slotStartAt) else { return nil }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "fr_FR")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
  }
}
