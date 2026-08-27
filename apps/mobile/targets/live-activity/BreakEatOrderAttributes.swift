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

  /// Heure de retrait à afficher : l'estimation prime (recalculée par Flaix),
  /// sinon le début du créneau. Nil quand aucune information n'est disponible.
  var pickupTimeLabel: String? {
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let fallback = ISO8601DateFormatter()

    func parse(_ value: String?) -> Date? {
      guard let value else { return nil }
      return iso.date(from: value) ?? fallback.date(from: value)
    }

    guard let date = parse(estimatedReadyAt) ?? parse(slotStartAt) else { return nil }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "fr_FR")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
  }
}
