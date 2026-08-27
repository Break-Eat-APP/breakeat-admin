import ActivityKit
import ExpoModulesCore

/// État initial fourni par le JavaScript au démarrage de l'activité.
/// Les champs optionnels reflètent une commande sans créneau ni estimation.
struct ContentStateRecord: Record {
  @Field var status: String = "CREATED"
  @Field var statusLabel: String = "Commande reçue"
  @Field var orderNumber: String = ""
  @Field var pickupPoint: String?
  @Field var estimatedReadyAt: String?
  @Field var slotStartAt: String?
  @Field var slotEndAt: String?
  @Field var updatedAt: String = ""
  @Field var customerArrived: Bool = false
}

/// Pont ActivityKit ↔ React Native.
///
/// Responsabilités volontairement limitées : DÉMARRER une activité, REMONTER
/// son token push, la TERMINER. Toutes les mises à jour de contenu passent par
/// APNs depuis le backend — jamais par l'app. C'est ce qui permet à la Live
/// Activity de continuer à vivre application fermée, et ce qui évite d'exposer
/// le moindre identifiant Apple côté client.
///
/// iOS 16.2 minimum : `ActivityContent` (avec `staleDate`) et les tokens push
/// d'activité n'existent pas avant. Sur un système plus ancien, `isSupported()`
/// renvoie false et l'app se contente de son suivi in-app.
public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BreakEatLiveActivity")

    // Émis à chaque token : le premier après le démarrage, puis à chaque
    // rotation décidée par iOS. Le JS le renvoie au backend, qui remplace
    // l'ancien.
    Events("onPushTokenChange")

    /// L'appareil peut-il afficher des Live Activities (version + réglage
    /// utilisateur, désactivable dans Réglages) ?
    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    /// Démarre une Live Activity pour une commande et renvoie son identifiant.
    /// Le token push arrive ensuite via `onPushTokenChange` (il n'est pas
    /// disponible immédiatement : iOS l'attribue de façon asynchrone).
    AsyncFunction("startActivity") { (orderId: String, state: ContentStateRecord) -> String in
      guard #available(iOS 16.2, *) else {
        throw LiveActivityError.unsupported
      }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        throw LiveActivityError.disabled
      }

      // Une seule activité par commande : si l'app relance le suivi d'une
      // commande déjà affichée, on réutilise l'existante plutôt que d'empiler
      // deux cartes identiques sur l'écran verrouillé.
      if let existing = Activity<BreakEatOrderAttributes>.activities
        .first(where: { $0.attributes.orderId == orderId }) {
        self.observePushToken(for: existing)
        return existing.id
      }

      let attributes = BreakEatOrderAttributes(orderId: orderId)
      let content = ActivityContent(state: state.toContentState(), staleDate: nil)

      do {
        let activity = try Activity.request(
          attributes: attributes,
          content: content,
          // `.token` demande à iOS un jeton de mise à jour distante : sans lui,
          // l'activité ne pourrait être modifiée que par l'app au premier plan.
          pushType: .token
        )
        self.observePushToken(for: activity)
        return activity.id
      } catch {
        throw LiveActivityError.requestFailed(error.localizedDescription)
      }
    }

    /// Termine une activité depuis l'app (l'utilisateur quitte le suivi).
    /// Le cas nominal reste la fin déclenchée par le backend via APNs.
    AsyncFunction("endActivity") { (activityId: String) -> Void in
      guard #available(iOS 16.2, *) else { return }
      guard let activity = Activity<BreakEatOrderAttributes>.activities
        .first(where: { $0.id == activityId }) else { return }

      await activity.end(nil, dismissalPolicy: .immediate)
    }

    /// Identifiants des activités encore vivantes.
    /// Sert à la réconciliation au démarrage de l'app : une activité inconnue
    /// du backend (token perdu) peut ainsi être ré-enregistrée ou close.
    AsyncFunction("listActivities") { () -> [[String: String]] in
      guard #available(iOS 16.2, *) else { return [] }
      return Activity<BreakEatOrderAttributes>.activities.map {
        ["activityId": $0.id, "orderId": $0.attributes.orderId]
      }
    }
  }

  /// Écoute les tokens successifs d'une activité et les remonte au JS.
  ///
  /// `pushTokenUpdates` est une séquence asynchrone qui émet le token initial
  /// PUIS chaque rotation. On ne la ferme jamais explicitement : elle s'achève
  /// d'elle-même quand l'activité se termine.
  @available(iOS 16.2, *)
  private func observePushToken(for activity: Activity<BreakEatOrderAttributes>) {
    Task { [weak self] in
      for await tokenData in activity.pushTokenUpdates {
        // APNs attend le token en hexadécimal, pas en base64.
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        self?.sendEvent(
          "onPushTokenChange",
          [
            "activityId": activity.id,
            "orderId": activity.attributes.orderId,
            "pushToken": token,
          ]
        )
      }
    }
  }
}

/// Erreurs remontées au JS avec un code stable (l'app peut les distinguer).
private enum LiveActivityError: Error, LocalizedError {
  case unsupported
  case disabled
  case requestFailed(String)

  var errorDescription: String? {
    switch self {
    case .unsupported:
      return "Les Live Activities nécessitent iOS 16.2 ou plus récent."
    case .disabled:
      return "Les activités en direct sont désactivées dans les réglages de l'iPhone."
    case .requestFailed(let reason):
      return "Impossible de démarrer la Live Activity : \(reason)"
    }
  }
}

private extension ContentStateRecord {
  func toContentState() -> BreakEatOrderAttributes.ContentState {
    BreakEatOrderAttributes.ContentState(
      status: status,
      statusLabel: statusLabel,
      orderNumber: orderNumber,
      pickupPoint: pickupPoint,
      estimatedReadyAt: estimatedReadyAt,
      slotStartAt: slotStartAt,
      slotEndAt: slotEndAt,
      updatedAt: updatedAt.isEmpty ? ISO8601DateFormatter().string(from: Date()) : updatedAt,
      customerArrived: customerArrived
    )
  }
}
