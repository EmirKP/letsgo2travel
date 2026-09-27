import ActivityKit
import SwiftUI
import WidgetKit

@main
struct FlightActivityWidgetBundle: WidgetBundle {
    var body: some Widget { FlightActivityWidget() }
}

private extension Color {
    static let l2tNight = Color(red: 0x07 / 255, green: 0x1B / 255, blue: 0x33 / 255)
    static let l2tGold = Color(red: 0xF6 / 255, green: 0xC4 / 255, blue: 0x45 / 255)
}

// A clock cannot confirm that an aircraft departed or arrived. Every phase
// describes the saved schedule, including old activities without an arrival.
private enum FlightPhase: Equatable {
    case waiting, scheduledFlight, arrivalDue, arrivalUnknown
}

private func flightPhase(departureAt: Date, arrivalAt: Date?, now: Date) -> FlightPhase {
    if now < departureAt { return .waiting }
    guard let arrivalAt, arrivalAt > departureAt else { return .arrivalUnknown }
    return now < arrivalAt ? .scheduledFlight : .arrivalDue
}

private func phaseLabel(_ phase: FlightPhase, english: Bool) -> String {
    switch phase {
    case .waiting: return english ? "Scheduled departure" : "Planlanan kalkış"
    case .scheduledFlight: return english ? "Scheduled arrival" : "Planlanan varış"
    case .arrivalDue: return english ? "Arrival time passed" : "Varış saati geçti"
    case .arrivalUnknown: return english ? "Departure time passed" : "Kalkış saati geçti"
    }
}

private struct AirportColumn: View {
    let code: String
    let date: Date?
    let timeZone: String?
    let departure: Bool
    let english: Bool
    var alignment: HorizontalAlignment = .leading

    private var zone: TimeZone? { timeZone.flatMap { TimeZone(identifier: $0) } }

    private func formatted(_ date: Date, pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: english ? "en_GB" : "tr_TR")
        formatter.timeZone = zone ?? .current
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    var body: some View {
        VStack(alignment: alignment, spacing: 1) {
            Text(code.isEmpty ? "—" : code)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(departure ? (english ? "Departure" : "Kalkış") : (english ? "Arrival" : "Varış"))
                .font(.system(size: 9, weight: .medium)).foregroundStyle(.white.opacity(0.65))
            if let date {
                Text(formatted(date, pattern: "HH:mm"))
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .monospacedDigit().foregroundStyle(Color.l2tGold)
                Text(formatted(date, pattern: "d MMM") + " · " + (zone?.abbreviation(for: date) ?? (english ? "Device time" : "Cihaz saati")))
                    .font(.system(size: 8)).foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1).minimumScaleFactor(0.7)
            } else {
                Text(english ? "Not entered" : "Girilmedi")
                    .font(.caption2).foregroundStyle(.white.opacity(0.65))
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ScheduledCountdown: View {
    let departureAt: Date
    let arrivalAt: Date?
    let english: Bool
    var compact = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { timeline in
            let phase = flightPhase(departureAt: departureAt, arrivalAt: arrivalAt, now: timeline.date)
            let target: Date? = phase == .waiting ? departureAt : (phase == .scheduledFlight ? arrivalAt : nil)
            if compact {
                if let target, target > timeline.date {
                    Text(timerInterval: timeline.date...target, countsDown: true)
                        .monospacedDigit().lineLimit(1).minimumScaleFactor(0.65)
                        .accessibilityHint(phaseLabel(phase, english: english))
                } else {
                    Image(systemName: "clock")
                        .accessibilityLabel(phaseLabel(phase, english: english))
                }
            } else {
                HStack(spacing: 8) {
                    Label(phaseLabel(phase, english: english), systemImage: "clock")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.8))
                        .lineLimit(1).minimumScaleFactor(0.75)
                    Spacer(minLength: 4)
                    if let target, target > timeline.date {
                        Text(timerInterval: timeline.date...target, countsDown: true)
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                            .monospacedDigit().foregroundStyle(Color.l2tGold)
                            .frame(width: 90, alignment: .trailing)
                            .lineLimit(1).minimumScaleFactor(0.75)
                    }
                }
            }
        }
    }
}

private struct ScheduleProgress: View {
    let departureAt: Date
    let arrivalAt: Date?

    var body: some View {
        if let arrivalAt, arrivalAt > departureAt {
            ProgressView(timerInterval: departureAt...arrivalAt, countsDown: false)
                .labelsHidden().tint(Color.l2tGold)
                .accessibilityHidden(true)
        }
    }
}

struct FlightActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(.l2tNight)
                .activitySystemActionForegroundColor(.l2tGold)
                .widgetURL(URL(string: context.attributes.deepLink))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    AirportColumn(code: context.attributes.originIata, date: context.state.departureAt,
                                  timeZone: context.attributes.originTimeZone, departure: true,
                                  english: context.attributes.language == "en")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    AirportColumn(code: context.attributes.destinationIata, date: context.state.arrivalAt,
                                  timeZone: context.attributes.destinationTimeZone, departure: false,
                                  english: context.attributes.language == "en", alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 6) {
                        Image(systemName: "airplane")
                            .font(.system(size: 21, weight: .medium)).foregroundStyle(Color.l2tGold)
                        if let number = context.attributes.flightNumber, !number.isEmpty {
                            Text(number).font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.8)).lineLimit(1)
                        }
                    }.padding(.top, 12)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 7) {
                        ScheduledCountdown(departureAt: context.state.departureAt, arrivalAt: context.state.arrivalAt,
                                           english: context.attributes.language == "en")
                        ScheduleProgress(departureAt: context.state.departureAt, arrivalAt: context.state.arrivalAt)
                        Text(context.attributes.language == "en" ? "Scheduled times · not live flight status" : "Planlanan saatler · canlı uçuş durumu değil")
                            .font(.system(size: 9)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                    }.padding(.top, 5)
                }
            } compactLeading: {
                HStack(spacing: 3) {
                    Image(systemName: "airplane").font(.system(size: 10))
                    Text(context.attributes.originIata.isEmpty ? "L2T" : context.attributes.originIata)
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                }.foregroundStyle(Color.l2tGold)
            } compactTrailing: {
                ScheduledCountdown(departureAt: context.state.departureAt, arrivalAt: context.state.arrivalAt,
                                   english: context.attributes.language == "en", compact: true)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.l2tGold).frame(width: 54)
            } minimal: {
                Image(systemName: "airplane").foregroundStyle(Color.l2tGold)
                    .accessibilityLabel(context.attributes.language == "en" ? "Flight schedule" : "Uçuş takvimi")
            }
            .keylineTint(.l2tGold)
            .widgetURL(URL(string: context.attributes.deepLink))
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<FlightActivityAttributes>
    private var english: Bool { context.attributes.language == "en" }
    private var flightTitle: String {
        if let number = context.attributes.flightNumber, !number.isEmpty { return number }
        return context.attributes.title
    }

    var body: some View {
        VStack(spacing: 5) {
            HStack {
                Text("LETSGO2TRAVEL").font(.system(size: 9, weight: .bold)).tracking(1.2)
                    .foregroundStyle(Color.l2tGold)
                Spacer()
                Text(flightTitle).font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.white.opacity(0.8)).lineLimit(1)
            }
            HStack(alignment: .center) {
                AirportColumn(code: context.attributes.originIata, date: context.state.departureAt,
                              timeZone: context.attributes.originTimeZone, departure: true, english: english)
                Spacer(minLength: 8)
                HStack(spacing: 8) {
                    Capsule().fill(Color.white.opacity(0.2)).frame(height: 1)
                    Image(systemName: "airplane").font(.system(size: 20)).foregroundStyle(Color.l2tGold)
                    Capsule().fill(Color.white.opacity(0.2)).frame(height: 1)
                }.frame(maxWidth: 100).accessibilityHidden(true)
                Spacer(minLength: 8)
                AirportColumn(code: context.attributes.destinationIata, date: context.state.arrivalAt,
                              timeZone: context.attributes.destinationTimeZone, departure: false,
                              english: english, alignment: .trailing)
            }
            ScheduledCountdown(departureAt: context.state.departureAt, arrivalAt: context.state.arrivalAt, english: english)
            ScheduleProgress(departureAt: context.state.departureAt, arrivalAt: context.state.arrivalAt)
            Text(english ? "Scheduled times · not live flight status" : "Planlanan saatler · canlı uçuş durumu değil")
                .font(.system(size: 9)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }
}
