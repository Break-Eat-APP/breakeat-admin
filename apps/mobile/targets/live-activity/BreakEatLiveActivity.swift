import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Marque

/// Couleurs Break Eat, alignées sur `apps/mobile/src/lib/theme.ts`.
/// Redéclarées ici car l'extension est un binaire séparé : elle ne partage ni
/// le bundle JavaScript ni les assets de l'application.
private enum Brand {
  static let orange = Color(red: 0.988, green: 0.251, blue: 0.008) // #FC4002
  static let green = Color(red: 0.086, green: 0.639, blue: 0.290)  // #16A34A
  static let ink = Color(red: 0.141, green: 0.122, blue: 0.114)    // #241F1D
  static let inkSoft = Color(red: 0.420, green: 0.392, blue: 0.376) // #6B6460
  static let border = Color(red: 0.937, green: 0.918, blue: 0.902) // #EFEAE6
}

/// Couleur de l'état : NE PAS renommer en `accentColor`, qui est aussi une
/// methode de SwiftUI.View — dans le corps d'une vue, Swift choisirait le
/// membre plutot que cette fonction, et le widget ne compilerait plus.
///
/// Couleur d'accent selon l'état : orange pendant la préparation, vert quand
/// c'est prêt, gris une fois terminé. Même code visuel que l'écran « Mes
/// commandes » de l'app.
private func statusColor(for state: BreakEatOrderAttributes.ContentState) -> Color {
  if state.isCancelled { return Brand.inkSoft }
  if state.isReady { return Brand.green }
  if state.status == "COLLECTED" { return Brand.inkSoft }
  return Brand.orange
}

private func statusSymbol(for state: BreakEatOrderAttributes.ContentState) -> String {
  if state.isCancelled { return "xmark.circle.fill" }
  if state.isReady { return "checkmark.circle.fill" }
  if state.status == "COLLECTED" { return "bag.circle.fill" }
  if state.status == "DELAYED" { return "clock.badge.exclamationmark.fill" }
  return "flame.circle.fill"
}

// MARK: - Écran verrouillé

/// Vue affichée sur l'écran verrouillé et dans le centre de notifications.
private struct LockScreenView: View {
  let state: BreakEatOrderAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // En-tête : marque + numéro de commande
      HStack(spacing: 8) {
        Text("BREAK EAT")
          .font(.system(size: 12, weight: .bold))
          .tracking(1.2)
          .foregroundStyle(Brand.orange)
        Spacer()
        Text("N° \(state.orderNumber)")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(Brand.inkSoft)
      }

      // Statut + heure de retrait
      HStack(alignment: .center, spacing: 10) {
        Image(systemName: statusSymbol(for: state))
          .font(.system(size: 22))
          .foregroundStyle(statusColor(for: state))

        VStack(alignment: .leading, spacing: 2) {
          Text(state.statusLabel)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(Brand.ink)

          if state.isReady, let point = state.pickupPoint {
            Text("Retrait : \(point)")
              .font(.system(size: 13))
              .foregroundStyle(Brand.inkSoft)
          } else if let time = state.pickupTimeLabel {
            Text("Retrait prévu à \(time)")
              .font(.system(size: 13))
              .foregroundStyle(Brand.inkSoft)
          } else if let point = state.pickupPoint {
            Text(point)
              .font(.system(size: 13))
              .foregroundStyle(Brand.inkSoft)
          }
        }

        Spacer()
      }

      // Progression — masquée si la commande est annulée (le parcours n'a plus
      // de sens) mais conservée une fois récupérée, pour montrer l'aboutissement.
      if !state.isCancelled {
        StepBar(state: state)
      }
    }
    .padding(16)
    .activityBackgroundTint(Color.white)
    .activitySystemActionForegroundColor(Brand.orange)
  }
}

/// Barre de progression en trois étapes : Commandée → Préparation → Prête.
private struct StepBar: View {
  let state: BreakEatOrderAttributes.ContentState

  private let labels = ["Commandée", "Préparation", "Prête"]
  private let colors = [Brand.ink, Brand.orange, Brand.green]

  var body: some View {
    VStack(spacing: 6) {
      HStack(spacing: 6) {
        ForEach(0..<labels.count, id: \.self) { index in
          Capsule()
            .fill(index <= state.stepIndex ? colors[index] : Brand.border)
            .frame(height: 4)
        }
      }
      HStack(spacing: 6) {
        ForEach(0..<labels.count, id: \.self) { index in
          Text(labels[index])
            .font(.system(size: 10, weight: index == state.stepIndex ? .semibold : .regular))
            .foregroundStyle(index <= state.stepIndex ? colors[index] : Brand.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
  }
}

// MARK: - Widget

struct BreakEatLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BreakEatOrderAttributes.self) { context in
      LockScreenView(state: context.state)

    } dynamicIsland: { context in
      DynamicIsland {
        // ── Vue développée (appui long sur la pilule) ──────────
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: statusSymbol(for: context.state))
            .font(.system(size: 26))
            .foregroundStyle(statusColor(for: context.state))
            .padding(.leading, 4)
        }

        DynamicIslandExpandedRegion(.trailing) {
          if let time = context.state.pickupTimeLabel, !context.state.isFinished {
            VStack(alignment: .trailing, spacing: 1) {
              Text(time)
                .font(.system(size: 19, weight: .semibold))
                .foregroundStyle(.white)
              Text("retrait")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.6))
            }
            .padding(.trailing, 4)
          }
        }

        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.state.statusLabel)
              .font(.system(size: 15, weight: .semibold))
              .foregroundStyle(.white)
            Text("N° \(context.state.orderNumber)")
              .font(.system(size: 11))
              .foregroundStyle(.white.opacity(0.6))
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }

        DynamicIslandExpandedRegion(.bottom) {
          if context.state.isReady, let point = context.state.pickupPoint {
            HStack(spacing: 6) {
              Image(systemName: "mappin.circle.fill")
                .foregroundStyle(Brand.green)
              Text("Retrait : \(point)")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
            }
          }
        }

      } compactLeading: {
        // ── Vue compacte : une seule commande en cours ─────────
        Image(systemName: statusSymbol(for: context.state))
          .foregroundStyle(statusColor(for: context.state))

      } compactTrailing: {
        if let time = context.state.pickupTimeLabel, !context.state.isFinished {
          Text(time)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(statusColor(for: context.state))
        }

      } minimal: {
        // ── Vue minimale : plusieurs activités simultanées ─────
        Image(systemName: statusSymbol(for: context.state))
          .foregroundStyle(statusColor(for: context.state))
      }
      // Ouvre l'app sur le suivi de la commande concernée (deep link déjà géré
      // par l'app : breakeat://order/<id>).
      .widgetURL(URL(string: "breakeat://order/\(context.attributes.orderId)"))
      .keylineTint(statusColor(for: context.state))
    }
  }
}

// MARK: - Point d'entrée de l'extension

@main
struct BreakEatWidgetBundle: WidgetBundle {
  var body: some Widget {
    BreakEatLiveActivity()
  }
}
