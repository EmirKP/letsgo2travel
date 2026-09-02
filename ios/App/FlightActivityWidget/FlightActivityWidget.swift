import ActivityKit
import SwiftUI
import WidgetKit

// Kilit ekranı + Dynamic Island (compact / expanded / minimal) görünümleri.
// Marka: gece laciverti zemin (#071B33), LetsGo altını vurgu (#F6C445).

@main
struct FlightActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        FlightActivityWidget()
    }
}

private extension Color {
    static let l2tNight = Color(red: 0x07 / 255, green: 0x1B / 255, blue: 0x33 / 255)
    static let l2tGold = Color(red: 0xF6 / 255, green: 0xC4 / 255, blue: 0x45 / 255)
}

// Kalkış GEÇMİŞSE Date.now...departureAt TERS ClosedRange olur (aktivite
// kalkıştan sonra +1 saat açık kalır) — ters aralık runtime hatasıdır.
// Tüm görünümler geri sayımı BU tek yardımcıdan alır: gelecekte → canlı
// geri sayım; geçti → güvenli "kalkış gerçekleşti" görünümü.
// (TS ayna testi: mobile/src/lib/liveActivity.ts countdownMode.)
private struct DepartureCountdown: View {
    let departureAt: Date
    var compact = false

    var body: some View {
        if departureAt > Date.now {
            Text(timerInterval: Date.now...departureAt, countsDown: true)
        } else if compact {
            Text("Uçtu")
        } else {
            Text("Kalkış gerçekleşti")
        }
    }
}

struct FlightActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            // Kilit ekranı görünümü
            LockScreenView(context: context)
                .activityBackgroundTint(.l2tNight)
                .activitySystemActionForegroundColor(.l2tGold)
                .widgetURL(URL(string: context.attributes.deepLink))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.originIata.isEmpty ? "✈︎" : context.attributes.originIata)
                            .font(.title2.bold()).foregroundStyle(Color.l2tGold)
                        Text("Kalkış").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.attributes.destinationIata.isEmpty ? "—" : context.attributes.destinationIata)
                            .font(.title2.bold()).foregroundStyle(Color.l2tGold)
                        Text("Varış").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.title).font(.caption).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.departureAt, style: .time)
                        Spacer()
                        DepartureCountdown(departureAt: context.state.departureAt)
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(Color.l2tGold)
                    }
                }
            } compactLeading: {
                Text(context.attributes.originIata.isEmpty ? "✈︎" : context.attributes.originIata)
                    .font(.caption2.bold()).foregroundStyle(Color.l2tGold)
            } compactTrailing: {
                DepartureCountdown(departureAt: context.state.departureAt, compact: true)
                    .font(.caption2.monospacedDigit())
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "airplane.departure").foregroundStyle(Color.l2tGold)
            }
            .widgetURL(URL(string: context.attributes.deepLink))
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<FlightActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "airplane.departure").foregroundStyle(Color.l2tGold)
                Text(context.attributes.title).font(.headline).foregroundStyle(.white).lineLimit(1)
                Spacer()
            }
            HStack(alignment: .firstTextBaseline) {
                if !context.attributes.originIata.isEmpty || !context.attributes.destinationIata.isEmpty {
                    Text("\(context.attributes.originIata) → \(context.attributes.destinationIata)")
                        .font(.title3.bold()).foregroundStyle(Color.l2tGold)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text(context.state.departureAt, style: .time)
                        .font(.subheadline).foregroundStyle(.white)
                    DepartureCountdown(departureAt: context.state.departureAt)
                        .font(.headline.monospacedDigit()).foregroundStyle(Color.l2tGold)
                }
            }
        }
        .padding(14)
    }
}
