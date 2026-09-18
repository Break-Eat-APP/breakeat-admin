import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Marque

/// Couleurs Break Eat, alignées sur `apps/mobile/src/lib/theme.ts`.
/// Redéclarées ici car l'extension est un binaire séparé : elle ne partage ni
/// le bundle JavaScript ni les assets de l'application.
private enum Brand {
  static let orange = Color(red: 0.992, green: 0.251, blue: 0.000) // #FD4000
  static let green = Color(red: 0.086, green: 0.639, blue: 0.290)  // #16A34A
  static let ink = Color(red: 0.141, green: 0.122, blue: 0.114)    // #241F1D
  static let inkSoft = Color(red: 0.420, green: 0.392, blue: 0.376) // #6B6460
  /// Produit manquant — même rouge que le poste opérateur.
  static let red = Color(red: 0.725, green: 0.110, blue: 0.110)    // #B91C1C
  /// Fond des pastilles et du rail de progression — beige très clair.
  static let track = Color(red: 0.960, green: 0.945, blue: 0.933)  // #F5F1EE
}

/// Couleur de l'état : NE PAS renommer en `accentColor`, qui est aussi une
/// methode de SwiftUI.View — dans le corps d'une vue, Swift choisirait le
/// membre plutot que cette fonction, et le widget ne compilerait plus.
///
/// Couleur d'accent selon l'état : orange pendant la préparation, vert quand
/// c'est prêt, gris une fois terminé. Même code visuel que l'écran « Mes
/// commandes » de l'app.
private func statusColor(for state: BreakEatOrderAttributes.ContentState) -> Color {
  if state.hasMissingItems { return Brand.red }
  if state.isCancelled { return Brand.inkSoft }
  if state.isReady { return Brand.green }
  if state.status == "COLLECTED" { return Brand.inkSoft }
  return Brand.orange
}

private func statusSymbol(for state: BreakEatOrderAttributes.ContentState) -> String {
  if state.hasMissingItems { return "exclamationmark.triangle.fill" }
  if state.isCancelled { return "xmark.circle.fill" }
  if state.isReady { return "checkmark.circle.fill" }
  if state.status == "COLLECTED" { return "bag.circle.fill" }
  if state.status == "DELAYED" { return "clock.badge.exclamationmark.fill" }
  return "bolt.circle.fill"
}

// MARK: - Liens de retour vers l'app

/// Le signalement d'arrivée, depuis l'écran verrouillé.
///
/// Pourquoi un `Link` et non un bouton interactif (`Button(intent:)`) : un
/// bouton d'intention s'exécute HORS de l'app, sans accès à sa session. Il
/// faudrait donc convoyer un jeton d'authentification jusqu'à l'extension —
/// un secret de plus à faire vivre, pour gagner une seconde. Le lien ouvre
/// l'app, qui signale l'arrivée avec la session déjà en main.
private func arrivalURL(orderId: String) -> URL? {
  URL(string: "breakeat://order/\(orderId)/arrived")
}

/// Le libellé du bouton d'arrivée, écrit à UN seul endroit.
///
/// L'écran verrouillé et l'îlot dynamique l'affichent tous les deux : deux
/// formulations pour le même geste se remarqueraient aussitôt.
///
/// Il dit ce qu'il attend du client plutôt que ce qu'il déclare à sa place :
/// « Je suis arrivé » se lit comme un constat, et laisse croire que le stand
/// est déjà prévenu.
private let LIBELLE_ARRIVEE = "Clique ici pour nous avertir que tu es là"

/// Ouvre le suivi de la commande (appui sur la carte elle-même).
private func orderURL(orderId: String) -> URL? {
  URL(string: "breakeat://order/\(orderId)")
}

// MARK: - Briques d'affichage

/// Bandeau de marque : pastille orange + nom, numéro de commande à droite.
private struct BrandRow: View {
  let orderNumber: String

  var body: some View {
    HStack(spacing: 7) {
      Circle()
        .fill(Brand.orange)
        .frame(width: 7, height: 7)
      Text("BREAK EAT")
        .font(.system(size: 11, weight: .heavy))
        .tracking(1.4)
        .foregroundStyle(Brand.orange)

      Spacer(minLength: 8)

      Text("N° \(orderNumber)")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(Brand.inkSoft)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(Capsule().fill(Brand.track))
    }
  }
}

/// Ligne principale : icône d'état, libellé, information de retrait, heure.
private struct HeroRow: View {
  let state: BreakEatOrderAttributes.ContentState

  private var subtitle: String? {
    if state.isReady, let point = state.pickupPoint { return point }
    if let time = state.pickupTimeLabel { return "Retrait prévu à \(time)" }
    return state.pickupPoint
  }

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      // L'icône vit dans un disque teinté plutôt que posée à nu : elle tient
      // sa place quel que soit le symbole, et le regard trouve l'état d'un coup.
      ZStack {
        Circle()
          .fill(statusColor(for: state).opacity(0.13))
          .frame(width: 42, height: 42)
        Image(systemName: statusSymbol(for: state))
          .font(.system(size: 21, weight: .semibold))
          .foregroundStyle(statusColor(for: state))
      }

      VStack(alignment: .leading, spacing: 3) {
        Text(state.statusLabel)
          .font(.system(size: 19, weight: .bold))
          .foregroundStyle(Brand.ink)
          .lineLimit(1)
          .minimumScaleFactor(0.8)

        if let subtitle {
          HStack(spacing: 4) {
            Image(systemName: state.isReady ? "mappin.circle.fill" : "clock.fill")
              .font(.system(size: 11))
              .foregroundStyle(Brand.inkSoft)
            Text(subtitle)
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(Brand.inkSoft)
              .lineLimit(1)
          }
        }
      }

      Spacer(minLength: 4)

      // Heure de retrait en gros à droite — sauf quand c'est prêt : le bouton
      // devient alors la seule chose à regarder.
      if !state.isReady, !state.isFinished, let time = state.pickupTimeLabel {
        VStack(alignment: .trailing, spacing: 0) {
          Text(time)
            .font(.system(size: 17, weight: .bold).monospacedDigit())
            .foregroundStyle(Brand.ink)
          Text("retrait")
            .font(.system(size: 9, weight: .medium))
            .tracking(0.6)
            .foregroundStyle(Brand.inkSoft)
        }
      }
    }
  }
}

/// Rail de progression continu : plus lisible d'un coup d'œil que trois
/// segments séparés, et l'avancée se lit comme une jauge qui se remplit.
private struct ProgressTrack: View {
  let state: BreakEatOrderAttributes.ContentState

  private let labels = ["Commandée", "Préparation", "Prête"]

  /// Remplissage visé. La première étape n'est pas à zéro : une jauge vide
  /// donnerait l'impression que rien n'a été enregistré.
  private var ratio: CGFloat {
    switch state.stepIndex {
    case 0: return 0.22
    case 1: return 0.62
    case 2: return 1.0
    default: return 0
    }
  }

  var body: some View {
    VStack(spacing: 7) {
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule()
            .fill(Brand.track)
          Capsule()
            .fill(
              LinearGradient(
                colors: [Brand.orange, statusColor(for: state)],
                startPoint: .leading,
                endPoint: .trailing
              )
            )
            .frame(width: max(geo.size.width * ratio, 12))
        }
      }
      .frame(height: 6)

      HStack(spacing: 6) {
        ForEach(0..<labels.count, id: \.self) { index in
          Text(labels[index])
            .font(.system(size: 10, weight: index == state.stepIndex ? .bold : .medium))
            .foregroundStyle(index <= state.stepIndex ? Brand.ink : Brand.inkSoft.opacity(0.7))
            .frame(
              maxWidth: .infinity,
              alignment: index == 0 ? .leading : (index == labels.count - 1 ? .trailing : .center)
            )
        }
      }
    }
  }
}

/// Le bouton d'arrivée — pleine largeur, vert, impossible à manquer.
private struct ArrivalButton: View {
  let orderId: String

  var body: some View {
    if let url = arrivalURL(orderId: orderId) {
      Link(destination: url) {
        HStack(spacing: 6) {
          Image(systemName: "figure.wave")
            .font(.system(size: 13, weight: .bold))
          // Une seule ligne, quitte à rétrécir un peu : la carte est déjà
          // haute, et un bouton qui passe à deux lignes la fait déborder —
          // iOS coupe alors le bas de la Live Activity sans prévenir.
          Text(LIBELLE_ARRIVEE)
            .font(.system(size: 13, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
        .foregroundStyle(.white)
        // La marge est POSÉE AVANT la largeur pleine : c'est ce qui la rend
        // utile. Le texte calcule alors son rétrécissement sur la largeur
        // moins ces marges, au lieu de venir toucher les bords de la pastille.
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 11)
        .background(
          Capsule().fill(
            LinearGradient(
              colors: [Brand.green, Brand.green.opacity(0.86)],
              startPoint: .top,
              endPoint: .bottom
            )
          )
        )
      }
    }
  }
}

/// Confirmation qui remplace le bouton une fois la présence annoncée.
private struct ArrivedBadge: View {
  var body: some View {
    HStack(spacing: 7) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(Brand.green)
      Text("Le stand sait que tu es là")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(Brand.green)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 10)
    .background(Capsule().fill(Brand.green.opacity(0.12)))
  }
}

/// En-tête d'un produit manquant : ce qui se passe, ce qu'il faut faire, et le
/// numéro à donner au comptoir.
///
/// Pas d'heure de retrait : le client n'a plus de rendez-vous à attendre, il
/// doit se présenter. L'heure affichée à la place (« 00:00 » pour un retrait
/// immédiat) brouillait justement ce message.
private struct MissingHeroRow: View {
  let state: BreakEatOrderAttributes.ContentState

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      ZStack {
        Circle()
          .fill(Brand.red.opacity(0.13))
          .frame(width: 42, height: 42)
        Image(systemName: "exclamationmark.triangle.fill")
          .font(.system(size: 19, weight: .semibold))
          .foregroundStyle(Brand.red)
      }

      VStack(alignment: .leading, spacing: 3) {
        Text(state.statusLabel)
          .font(.system(size: 19, weight: .bold))
          .foregroundStyle(Brand.ink)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        Text("Rendez-vous au point de retrait")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(Brand.inkSoft)
          .lineLimit(1)
          .minimumScaleFactor(0.85)
      }

      Spacer(minLength: 4)

      VStack(alignment: .trailing, spacing: 0) {
        Text("N° \(state.orderNumber)")
          .font(.system(size: 17, weight: .bold).monospacedDigit())
          .foregroundStyle(Brand.ink)
          .lineLimit(1)
        Text("commande")
          .font(.system(size: 9, weight: .medium))
          .tracking(0.6)
          .foregroundStyle(Brand.inkSoft)
      }
    }
  }
}

/// Ce qui manque, en toutes lettres : l'en-tête dit où aller, cette ligne dit
/// pourquoi.
private struct MissingRow: View {
  let summary: String

  var body: some View {
    Text("Manquant : \(summary)")
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(Brand.red)
      .lineLimit(2)
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 10).fill(Brand.red.opacity(0.08)))
  }
}

// MARK: - Écran verrouillé

/// Vue affichée sur l'écran verrouillé et dans le centre de notifications.
private struct LockScreenView: View {
  let orderId: String
  let state: BreakEatOrderAttributes.ContentState

  var body: some View {
    // iOS limite la hauteur d'une Live Activity et ROGNE ce qui dépasse, en
    // haut comme en bas. Avec un manque, la version complète (marque, étape,
    // détail, progression, bouton) débordait : la marque disparaissait, le
    // bouton vert était coupé à moitié. En cas de manque, on s'en tient donc à
    // l'essentiel : quoi faire, ce qui manque, où en est la commande.
    VStack(alignment: .leading, spacing: state.hasMissingItems ? 10 : 13) {
      if state.hasMissingItems {
        MissingHeroRow(state: state)
        MissingRow(summary: state.missingSummary)
      } else {
        BrandRow(orderNumber: state.orderNumber)
        HeroRow(state: state)
      }

      // Progression — masquée si la commande est annulée (le parcours n'a plus
      // de sens) mais conservée une fois récupérée, pour montrer l'aboutissement.
      if !state.isCancelled {
        ProgressTrack(state: state)
      }

      // L'action n'apparaît qu'au moment où elle a un sens : la commande attend
      // au comptoir. Avant, le client n'a rien à signaler ; après, c'est fait.
      // Rien de tout cela en cas de manque : la consigne est déjà d'y aller.
      if !state.hasMissingItems {
        if state.canAnnounceArrival {
          ArrivalButton(orderId: orderId)
        } else if state.hasArrived, !state.isFinished {
          ArrivedBadge()
        }
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .activityBackgroundTint(Color.white)
    .activitySystemActionForegroundColor(Brand.orange)
  }
}

// MARK: - Widget

struct BreakEatLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: BreakEatOrderAttributes.self) { context in
      LockScreenView(orderId: context.attributes.orderId, state: context.state)
        // Appui sur la carte (hors bouton) : ouvre le suivi de la commande.
        .widgetURL(orderURL(orderId: context.attributes.orderId))

    } dynamicIsland: { context in
      DynamicIsland {
        // ── Vue développée (appui long sur la pilule) ──────────
        DynamicIslandExpandedRegion(.leading) {
          ZStack {
            Circle()
              .fill(statusColor(for: context.state).opacity(0.18))
              .frame(width: 38, height: 38)
            Image(systemName: statusSymbol(for: context.state))
              .font(.system(size: 19, weight: .semibold))
              .foregroundStyle(statusColor(for: context.state))
          }
          .padding(.leading, 4)
        }

        DynamicIslandExpandedRegion(.trailing) {
          if context.state.hasMissingItems {
            VStack(alignment: .trailing, spacing: 1) {
              Text("N° \(context.state.orderNumber)")
                .font(.system(size: 17, weight: .bold).monospacedDigit())
                .foregroundStyle(.white)
              Text("commande")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.6))
            }
            .padding(.trailing, 4)
          } else if let time = context.state.pickupTimeLabel, !context.state.isFinished {
            VStack(alignment: .trailing, spacing: 1) {
              Text(time)
                .font(.system(size: 19, weight: .bold).monospacedDigit())
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
              .font(.system(size: 15, weight: .bold))
              .foregroundStyle(.white)
              .lineLimit(1)
            Text(context.state.hasMissingItems
              ? "Rendez-vous au point de retrait"
              : "N° \(context.state.orderNumber)")
              .font(.system(size: 11))
              .foregroundStyle(.white.opacity(0.6))
              .lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }

        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 8) {
            if context.state.hasMissingItems {
              Text("Manquant : \(context.state.missingSummary)")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if context.state.canAnnounceArrival {
              VStack(spacing: 8) {
                if let point = context.state.pickupPoint {
                  HStack(spacing: 6) {
                    Image(systemName: "mappin.circle.fill")
                      .foregroundStyle(Brand.green)
                    Text(point)
                      .font(.system(size: 13, weight: .semibold))
                      .foregroundStyle(.white)
                  }
                }
                if let url = arrivalURL(orderId: context.attributes.orderId) {
                  Link(destination: url) {
                    Text(LIBELLE_ARRIVEE)
                      .font(.system(size: 13, weight: .bold))
                      .lineLimit(1)
                      .minimumScaleFactor(0.8)
                      .foregroundStyle(.white)
                      .padding(.horizontal, 12)
                      .frame(maxWidth: .infinity)
                      .padding(.vertical, 9)
                      .background(Capsule().fill(Brand.green))
                  }
                }
              }
              .padding(.top, 2)
            } else if context.state.hasArrived, !context.state.isFinished {
              HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                  .foregroundStyle(Brand.green)
                Text("Le stand sait que tu es là")
                  .font(.system(size: 13, weight: .semibold))
                  .foregroundStyle(.white)
              }
            }
          }
        }

      } compactLeading: {
        // ── Vue compacte : une seule commande en cours ─────────
        Image(systemName: statusSymbol(for: context.state))
          .foregroundStyle(statusColor(for: context.state))

      } compactTrailing: {
        if context.state.hasMissingItems {
          Text("N° \(context.state.orderNumber)")
            .font(.system(size: 13, weight: .semibold).monospacedDigit())
            .foregroundStyle(Brand.red)
        } else if context.state.canAnnounceArrival {
          Image(systemName: "figure.wave")
            .foregroundStyle(Brand.green)
        } else if let time = context.state.pickupTimeLabel, !context.state.isFinished {
          Text(time)
            .font(.system(size: 13, weight: .semibold).monospacedDigit())
            .foregroundStyle(statusColor(for: context.state))
        }

      } minimal: {
        // ── Vue minimale : plusieurs activités simultanées ─────
        Image(systemName: statusSymbol(for: context.state))
          .foregroundStyle(statusColor(for: context.state))
      }
      // Ouvre l'app sur le suivi de la commande concernée.
      .widgetURL(orderURL(orderId: context.attributes.orderId))
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
