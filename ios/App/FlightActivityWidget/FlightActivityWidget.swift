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

private enum FlightPhase: Equatable {
    case waiting
    case flying
    case arrived
}

private func flightPhase(departureAt: Date, arrivalAt: Date?, now: Date) -> FlightPhase {
    if now < departureAt { return .waiting }
    if let arrivalAt, arrivalAt > departureAt, now < arrivalAt { return .flying }
    return .arrived
}

// TimelineView, uygulama kapalıyken de kalkış anında "Uçuyoruz" evresine
// ve ardından varış evresine geçer. Her sayaç yalnız gelecekteki bir tarih
// için oluşturulur; ters ClosedRange kaynaklı 0:00 takılması oluşmaz.
private struct FlightPhaseLabel: View {
    let departureAt: Date
    let arrivalAt: Date?
    let language: String
    let title: String

    private var isEnglish: Bool { language == "en" }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { timeline in
            VStack(spacing: 2) {
                switch flightPhase(departureAt: departureAt, arrivalAt: arrivalAt, now: timeline.date) {
                case .waiting:
                    HStack(spacing: 4) {
                        Image(systemName: "airplane.departure")
                        Text(isEnglish ? "Getting ready" : "Uçuşa hazırlan")
                    }
                case .flying:
                    HStack(spacing: 4) {
                        Image(systemName: "airplane")
                        Text(isEnglish ? "Flying" : "Uçuyoruz")
                    }
                    .foregroundStyle(Color.l2tGold)
                case .arrived:
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                        Text(isEnglish ? "Arrived" : "Varış tamamlandı")
                    }
                }
                Text(title).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, alignment: .center)
        }
    }
}

private struct FlightCountdown: View {
    let departureAt: Date
    let arrivalAt: Date?
    let language: String
    let kind: FlightPhase

    private var isEnglish: Bool { language == "en" }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { timeline in
            let currentPhase = flightPhase(departureAt: departureAt, arrivalAt: arrivalAt, now: timeline.date)
            if kind == .waiting, currentPhase == .waiting {
                VStack(alignment: .leading, spacing: 1) {
                    Text(isEnglish ? "Departs in" : "Kalkışa").font(.system(size: 9, weight: .semibold))
                    Text(timerInterval: timeline.date...departureAt, countsDown: true)
                        .font(.caption.bold().monospacedDigit())
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .frame(minWidth: 46, alignment: .leading)
                }
                .foregroundStyle(Color.l2tGold)
            } else if kind == .flying, currentPhase == .flying, let arrivalAt = arrivalAt {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(isEnglish ? "Arrives in" : "Varışa").font(.system(size: 9, weight: .semibold))
                    Text(timerInterval: timeline.date...arrivalAt, countsDown: true)
                        .font(.caption.bold().monospacedDigit())
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                        .frame(minWidth: 46, alignment: .trailing)
                }
                .foregroundStyle(Color.l2tGold)
            }
        }
    }
}

private struct CompactFlightStatus: View {
    let departureAt: Date
    let arrivalAt: Date?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { timeline in
            switch flightPhase(departureAt: departureAt, arrivalAt: arrivalAt, now: timeline.date) {
            case .waiting:
                Text(timerInterval: timeline.date...departureAt, countsDown: true)
            case .flying:
                if let arrivalAt = arrivalAt {
                    Text(timerInterval: timeline.date...arrivalAt, countsDown: true)
                }
            case .arrived:
                Image(systemName: "checkmark.circle.fill")
            }
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
                        Text(context.attributes.language == "en" ? "Departure" : "Kalkış").font(.caption2).foregroundStyle(.secondary)
                        Text(context.state.departureAt, style: .time).font(.caption).foregroundStyle(.white)
                        FlightCountdown(
                            departureAt: context.state.departureAt,
                            arrivalAt: context.state.arrivalAt,
                            language: context.attributes.language ?? "tr",
                            kind: .waiting
                        )
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.attributes.destinationIata.isEmpty ? "—" : context.attributes.destinationIata)
                            .font(.title2.bold()).foregroundStyle(Color.l2tGold)
                        Text(context.attributes.language == "en" ? "Arrival" : "Varış").font(.caption2).foregroundStyle(.secondary)
                        if let arrivalAt = context.state.arrivalAt {
                            Text(arrivalAt, style: .time).font(.caption).foregroundStyle(.white)
                        }
                        FlightCountdown(
                            departureAt: context.state.departureAt,
                            arrivalAt: context.state.arrivalAt,
                            language: context.attributes.language ?? "tr",
                            kind: .flying
                        )
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    FlightPhaseLabel(
                        departureAt: context.state.departureAt,
                        arrivalAt: context.state.arrivalAt,
                        language: context.attributes.language ?? "tr",
                        title: context.attributes.title
                    )
                    .font(.caption.bold())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let arrivalAt = context.state.arrivalAt, arrivalAt > context.state.departureAt {
                        ProgressView(timerInterval: context.state.departureAt...arrivalAt)
                            .labelsHidden()
                            .tint(Color.l2tGold)
                    }
                }
            } compactLeading: {
                Text(context.attributes.originIata.isEmpty ? "✈︎" : context.attributes.originIata)
                    .font(.caption2.bold()).foregroundStyle(Color.l2tGold)
            } compactTrailing: {
                CompactFlightStatus(
                    departureAt: context.state.departureAt,
                    arrivalAt: context.state.arrivalAt
                )
                    .font(.caption2.monospacedDigit())
                    .frame(maxWidth: 52)
            } minimal: {
                TimelineView(.periodic(from: .now, by: 15)) { timeline in
                    let phase = flightPhase(departureAt: context.state.departureAt, arrivalAt: context.state.arrivalAt, now: timeline.date)
                    Image(systemName: phase == .arrived ? "checkmark.circle.fill" : (phase == .waiting ? "airplane.departure" : "airplane"))
                        .foregroundStyle(Color.l2tGold)
                }
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
                Spacer(minLength: 0)
                FlightPhaseLabel(
                    departureAt: context.state.departureAt,
                    arrivalAt: context.state.arrivalAt,
                    language: context.attributes.language ?? "tr",
                    title: context.attributes.title
                )
                .font(.headline)
                .foregroundStyle(.white)
                Spacer(minLength: 0)
            }
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.originIata.isEmpty ? "✈︎" : context.attributes.originIata)
                        .font(.title3.bold()).foregroundStyle(Color.l2tGold)
                    Text(context.attributes.language == "en" ? "Departure" : "Kalkış").font(.caption2).foregroundStyle(.secondary)
                    Text(context.state.departureAt, style: .time).font(.subheadline).foregroundStyle(.white)
                    FlightCountdown(
                        departureAt: context.state.departureAt,
                        arrivalAt: context.state.arrivalAt,
                        language: context.attributes.language ?? "tr",
                        kind: .waiting
                    )
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(context.attributes.destinationIata.isEmpty ? "—" : context.attributes.destinationIata)
                        .font(.title3.bold()).foregroundStyle(Color.l2tGold)
                    Text(context.attributes.language == "en" ? "Arrival" : "Varış").font(.caption2).foregroundStyle(.secondary)
                    if let arrivalAt = context.state.arrivalAt {
                        Text(arrivalAt, style: .time).font(.subheadline).foregroundStyle(.white)
                    }
                    FlightCountdown(
                        departureAt: context.state.departureAt,
                        arrivalAt: context.state.arrivalAt,
                        language: context.attributes.language ?? "tr",
                        kind: .flying
                    )
                    .frame(maxWidth: 62, alignment: .trailing)
                }
            }
            if let arrivalAt = context.state.arrivalAt, arrivalAt > context.state.departureAt {
                ProgressView(timerInterval: context.state.departureAt...arrivalAt)
                    .labelsHidden()
                    .tint(Color.l2tGold)
            }
        }
        .padding(14)
    }
}
