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
    var timeLabel: String? = nil

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
            Text(timeLabel ?? (departure ? (english ? "Departure" : "Kalkış") : (english ? "Arrival" : "Varış")))
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

/// Provider state is an observation with an expiry, never inferred from a clock.
private struct FlightReadout {
    let state: FlightActivityAttributes.ContentState
    let now: Date
    let english: Bool
    var provider: Bool { state.providerStatus != nil }
    var expired: Bool { provider && (state.providerExpiresAt == nil || state.providerExpiresAt! <= now) }
    var fresh: Bool {
        guard !expired, let updated = state.providerUpdatedAt, let until = state.providerFreshUntil else { return false }
        return updated <= now.addingTimeInterval(60) && until > now
    }
    private func knownKind(_ kind: String?) -> Bool { kind == "actual" || kind == "estimated" }
    var departure: Date { fresh && knownKind(state.departureKind) ? (state.revisedDepartureAt ?? state.departureAt) : state.departureAt }
    var arrival: Date? { fresh && knownKind(state.arrivalKind) ? (state.revisedArrivalAt ?? state.arrivalAt) : state.arrivalAt }
    func timingLabel(departing: Bool) -> String {
        let revised = departing ? state.revisedDepartureAt : state.revisedArrivalAt
        let kind = departing ? state.departureKind : state.arrivalKind
        if fresh && revised != nil && knownKind(kind) {
            if kind == "actual" { return english ? "Actual" : "Gerçekleşen" }
            if kind == "estimated" { return english ? "Estimated" : "Tahmini" }
            return english ? "Updated" : "Güncellenen"
        }
        return english ? "Scheduled" : "Planlanan"
    }
    var statusLabel: String? {
        if expired { return english ? "Open your trip to refresh" : "Yenilemek için seyahatini aç" }
        guard provider else { return nil }
        guard fresh else { return english ? "Status needs updating" : "Durum güncel değil" }
        switch state.providerStatus {
        case "EnRoute", "Departed", "Approaching": return english ? "In the air" : "Havada"
        case "Delayed": return english ? "Delayed" : "Gecikmeli"
        case "Boarding": return english ? "Boarding" : "Uçağa alım başladı"
        case "GateClosed": return english ? "Gate closed" : "Kapı kapandı"
        case "CheckIn": return english ? "Check-in open" : "Check-in açık"
        case "Expected": return english ? "Scheduled" : "Planlandı"
        default: return english ? "Status not confirmed" : "Durum doğrulanmadı"
        }
    }
}

private struct FlightObservation: View {
    let readout: FlightReadout
    var body: some View {
        VStack(spacing: 6) {
            if let status = readout.statusLabel {
                HStack(spacing: 5) {
                    Circle().fill(readout.fresh ? Color.blue : Color.l2tGold).frame(width: 5, height: 5)
                    Text(status).font(.system(size: 11, weight: .semibold))
                    Spacer(minLength: 0)
                    if readout.provider { Text("AeroDataBox").font(.system(size: 9)) }
                }.foregroundStyle(.white.opacity(0.85))
            }
            if readout.provider && !readout.expired, let updated = readout.state.providerUpdatedAt {
                HStack(spacing: 3) {
                    Text(readout.english ? "Updated" : "Son bilgi")
                    Text(updated, style: .time)
                    Spacer(minLength: 0)
                    Text(readout.english ? "Tap to open trip" : "Seyahate dönmek için dokun")
                }.font(.system(size: 9)).foregroundStyle(.white.opacity(0.6))
            } else if !readout.provider {
                Text(readout.english ? "Your ticket schedule · not live flight status" : "Biletindeki saatler · canlı uçuş durumu değil")
                    .font(.system(size: 9)).foregroundStyle(.white.opacity(0.6))
            }
        }
    }
}

private struct ActivityAirport: View {
    let context: ActivityViewContext<FlightActivityAttributes>
    let departure: Bool
    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { timeline in
            let readout = FlightReadout(state: context.state, now: timeline.date, english: context.attributes.language == "en")
            if !readout.expired {
                AirportColumn(code: departure ? context.attributes.originIata : context.attributes.destinationIata,
                              date: departure ? readout.departure : readout.arrival,
                              timeZone: departure ? context.attributes.originTimeZone : context.attributes.destinationTimeZone,
                              departure: departure, english: readout.english,
                              alignment: departure ? .leading : .trailing,
                              timeLabel: readout.timingLabel(departing: departure))
            }
        }
    }
}

private struct ScheduledCountdown: View {
    let departureAt: Date
    let arrivalAt: Date?
    let english: Bool
    var compact = false
    var departureLabel: String? = nil
    var arrivalLabel: String? = nil

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
                    Label(phase == .waiting && departureLabel != nil ? departureLabel! + (english ? " departure" : " kalkış") : phase == .scheduledFlight && arrivalLabel != nil ? arrivalLabel! + (english ? " arrival" : " varış") : phaseLabel(phase, english: english), systemImage: "clock")
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
                DynamicIslandExpandedRegion(.leading) { ActivityAirport(context: context, departure: true) }
                DynamicIslandExpandedRegion(.trailing) { ActivityAirport(context: context, departure: false) }
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
                    TimelineView(.periodic(from: .now, by: 30)) { timeline in
                        let readout = FlightReadout(state: context.state, now: timeline.date, english: context.attributes.language == "en")
                        VStack(spacing: 8) {
                            if !readout.expired {
                                ScheduledCountdown(departureAt: readout.departure, arrivalAt: readout.arrival, english: readout.english,
                                                   departureLabel: readout.timingLabel(departing: true), arrivalLabel: readout.timingLabel(departing: false))
                                ScheduleProgress(departureAt: readout.departure, arrivalAt: readout.arrival)
                            }
                            FlightObservation(readout: readout)
                        }.padding(.top, 6)
                    }
                }
            } compactLeading: {
                HStack(spacing: 4) {
                    Image(systemName: "airplane").font(.system(size: 11))
                    Text(context.attributes.flightNumber?.isEmpty == false ? context.attributes.flightNumber! : "L2T")
                        .font(.system(size: 10, weight: .semibold, design: .rounded)).lineLimit(1)
                }.foregroundStyle(Color.l2tGold)
            } compactTrailing: {
                TimelineView(.periodic(from: .now, by: 30)) { timeline in
                    let readout = FlightReadout(state: context.state, now: timeline.date, english: context.attributes.language == "en")
                    if readout.expired || (readout.provider && !readout.fresh) {
                        Image(systemName: "arrow.clockwise").accessibilityLabel(readout.english ? "Refresh flight status" : "Uçuş durumunu yenile")
                    } else {
                        ScheduledCountdown(departureAt: readout.departure, arrivalAt: readout.arrival, english: readout.english, compact: true)
                    }
                }.font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.l2tGold).frame(width: 54)
            } minimal: {
                Image(systemName: "airplane").foregroundStyle(Color.l2tGold)
                    .accessibilityLabel(context.attributes.language == "en" ? "Your flight" : "Uçuşun")
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
        TimelineView(.periodic(from: .now, by: 30)) { timeline in
            let readout = FlightReadout(state: context.state, now: timeline.date, english: english)
            VStack(spacing: 9) {
                HStack {
                    Label("LETSGO2TRAVEL", systemImage: "airplane.circle.fill")
                        .font(.system(size: 10, weight: .bold)).tracking(0.8).foregroundStyle(Color.l2tGold)
                    Spacer()
                    Text(readout.expired ? "" : flightTitle).font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(.white.opacity(0.08), in: Capsule())
                        .foregroundStyle(.white.opacity(0.9)).lineLimit(1)
                }
                if !readout.expired {
                    HStack(alignment: .center) {
                        ActivityAirport(context: context, departure: true)
                        Spacer(minLength: 8)
                        HStack(spacing: 8) {
                            Capsule().fill(Color.white.opacity(0.2)).frame(height: 1)
                            Image(systemName: "airplane").font(.system(size: 20)).foregroundStyle(Color.l2tGold)
                            Capsule().fill(Color.white.opacity(0.2)).frame(height: 1)
                        }.frame(maxWidth: 100).accessibilityHidden(true)
                        Spacer(minLength: 8)
                        ActivityAirport(context: context, departure: false)
                    }
                    ScheduledCountdown(departureAt: readout.departure, arrivalAt: readout.arrival, english: english,
                                       departureLabel: readout.timingLabel(departing: true), arrivalLabel: readout.timingLabel(departing: false))
                    ScheduleProgress(departureAt: readout.departure, arrivalAt: readout.arrival)
                }
                FlightObservation(readout: readout)
            }.padding(.horizontal, 17).padding(.vertical, 12)
        }
    }
}
