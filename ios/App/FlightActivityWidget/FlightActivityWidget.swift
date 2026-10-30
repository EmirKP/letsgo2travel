import ActivityKit
import SwiftUI
import WidgetKit

@main
struct FlightActivityWidgetBundle: WidgetBundle {
    var body: some Widget { FlightActivityWidget(); JourneyActivityWidget() }
}

private extension Color {
    static let l2tNight = Color(red: 0x07 / 255, green: 0x1B / 255, blue: 0x33 / 255)
    static let l2tGold = Color(red: 0xF6 / 255, green: 0xC4 / 255, blue: 0x45 / 255)
}

// Preserve the selected app language even when the device uses another locale.
private enum FlightLanguage: String {
    case tr, en, sq

    init(_ value: String?) { self = FlightLanguage(rawValue: value ?? "tr") ?? .tr }

    func text(_ tr: String, _ en: String, _ sq: String) -> String {
        switch self {
        case .tr: return tr
        case .en: return en
        case .sq: return sq
        }
    }

    var locale: Locale { Locale(identifier: text("tr_TR", "en_GB", "sq_AL")) }
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

private func phaseLabel(_ phase: FlightPhase, language: FlightLanguage) -> String {
    switch phase {
    case .waiting: return language.text("Planlanan kalkış", "Scheduled departure", "Nisja sipas orarit")
    case .scheduledFlight: return language.text("Planlanan varış", "Scheduled arrival", "Mbërritja sipas orarit")
    case .arrivalDue: return language.text("Varış saati geçti", "Arrival time passed", "Ora e mbërritjes ka kaluar")
    case .arrivalUnknown: return language.text("Kalkış saati geçti", "Departure time passed", "Ora e nisjes ka kaluar")
    }
}

private struct AirportColumn: View {
    let code: String
    let date: Date?
    let timeZone: String?
    let departure: Bool
    let language: FlightLanguage
    var alignment: HorizontalAlignment = .leading
    var timeLabel: String? = nil

    private var zone: TimeZone? { timeZone.flatMap { TimeZone(identifier: $0) } }

    private func formatted(_ date: Date, pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = language.locale
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
            Text(timeLabel ?? (departure ? (language.text("Kalkış", "Departure", "Nisja")) : (language.text("Varış", "Arrival", "Mbërritja"))))
                .font(.system(size: 9, weight: .medium)).foregroundStyle(.white.opacity(0.65))
            if let date {
                Text(formatted(date, pattern: "HH:mm"))
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .monospacedDigit().foregroundStyle(Color.l2tGold)
                Text(formatted(date, pattern: "d MMM") + " · " + (zone?.abbreviation(for: date) ?? (language.text("Cihaz saati", "Device time", "Ora e pajisjes"))))
                    .font(.system(size: 8)).foregroundStyle(.white.opacity(0.65))
                    .lineLimit(1).minimumScaleFactor(0.7)
            } else {
                Text(language.text("Girilmedi", "Not entered", "Nuk është vendosur"))
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
    let language: FlightLanguage
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
            if kind == "actual" { return language.text("Gerçekleşen", "Actual", "E kryer") }
            if kind == "estimated" { return language.text("Tahmini", "Estimated", "E parashikuar") }
            return language.text("Güncellenen", "Updated", "E përditësuar")
        }
        return language.text("Planlanan", "Scheduled", "Sipas orarit")
    }
    var statusLabel: String? {
        if expired { return language.text("Yenilemek için seyahatini aç", "Open your trip to refresh", "Hap udhëtimin për ta rifreskuar") }
        guard provider else { return nil }
        guard fresh else { return language.text("Durum güncel değil", "Status needs updating", "Statusi duhet përditësuar") }
        switch state.providerStatus {
        case "EnRoute", "Departed", "Approaching": return language.text("Havada", "In the air", "Në fluturim")
        case "Delayed": return language.text("Gecikmeli", "Delayed", "Me vonesë")
        case "Boarding": return language.text("Uçağa alım başladı", "Boarding", "Hipja në avion ka filluar")
        case "GateClosed": return language.text("Kapı kapandı", "Gate closed", "Porta është mbyllur")
        case "CheckIn": return language.text("Check-in açık", "Check-in open", "Regjistrimi është hapur")
        case "Expected": return language.text("Planlandı", "Scheduled", "Sipas orarit")
        default: return language.text("Durum doğrulanmadı", "Status not confirmed", "Statusi nuk është konfirmuar")
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
                    Text(readout.language.text("Son bilgi", "Updated", "Përditësuar"))
                    Text(updated, style: .time).environment(\.locale, readout.language.locale)
                    Spacer(minLength: 0)
                    Text(readout.language.text("Seyahate dönmek için dokun", "Tap to open trip", "Prek për të hapur udhëtimin"))
                }.font(.system(size: 9)).foregroundStyle(.white.opacity(0.6))
            } else if !readout.provider {
                Text(readout.language.text("Biletindeki saatler · canlı uçuş durumu değil", "Your ticket schedule · not live flight status", "Orari i biletës · jo statusi i fluturimit në kohë reale"))
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
            let readout = FlightReadout(state: context.state, now: timeline.date, language: FlightLanguage(context.attributes.language))
            if !readout.expired {
                AirportColumn(code: departure ? context.attributes.originIata : context.attributes.destinationIata,
                              date: departure ? readout.departure : readout.arrival,
                              timeZone: departure ? context.attributes.originTimeZone : context.attributes.destinationTimeZone,
                              departure: departure, language: readout.language,
                              alignment: departure ? .leading : .trailing,
                              timeLabel: readout.timingLabel(departing: departure))
            }
        }
    }
}

private struct ScheduledCountdown: View {
    let departureAt: Date
    let arrivalAt: Date?
    let language: FlightLanguage
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
                        .accessibilityHint(phaseLabel(phase, language: language))
                } else {
                    Image(systemName: "clock")
                        .accessibilityLabel(phaseLabel(phase, language: language))
                }
            } else {
                HStack(spacing: 8) {
                    Label(phase == .waiting && departureLabel != nil ? departureLabel! + (language.text(" kalkış", " departure", " · nisja")) : phase == .scheduledFlight && arrivalLabel != nil ? arrivalLabel! + (language.text(" varış", " arrival", " · mbërritja")) : phaseLabel(phase, language: language), systemImage: "clock")
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
                        let readout = FlightReadout(state: context.state, now: timeline.date, language: FlightLanguage(context.attributes.language))
                        VStack(spacing: 8) {
                            if !readout.expired {
                                ScheduledCountdown(departureAt: readout.departure, arrivalAt: readout.arrival, language: readout.language,
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
                    let readout = FlightReadout(state: context.state, now: timeline.date, language: FlightLanguage(context.attributes.language))
                    if readout.expired || (readout.provider && !readout.fresh) {
                        Image(systemName: "arrow.clockwise").accessibilityLabel(readout.language.text("Uçuş durumunu yenile", "Refresh flight status", "Rifresko statusin e fluturimit"))
                    } else {
                        ScheduledCountdown(departureAt: readout.departure, arrivalAt: readout.arrival, language: readout.language, compact: true)
                    }
                }.font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(Color.l2tGold).frame(width: 54)
            } minimal: {
                Image(systemName: "airplane").foregroundStyle(Color.l2tGold)
                    .accessibilityLabel(FlightLanguage(context.attributes.language).text("Uçuşun", "Your flight", "Fluturimi yt"))
            }
            .keylineTint(.l2tGold)
            .widgetURL(URL(string: context.attributes.deepLink))
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<FlightActivityAttributes>
    private var language: FlightLanguage { FlightLanguage(context.attributes.language) }
    private var flightTitle: String {
        if let number = context.attributes.flightNumber, !number.isEmpty { return number }
        return context.attributes.title
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { timeline in
            let readout = FlightReadout(state: context.state, now: timeline.date, language: language)
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
                    ScheduledCountdown(departureAt: readout.departure, arrivalAt: readout.arrival, language: language,
                                       departureLabel: readout.timingLabel(departing: true), arrivalLabel: readout.timingLabel(departing: false))
                    ScheduleProgress(departureAt: readout.departure, arrivalAt: readout.arrival)
                }
                FlightObservation(readout: readout)
            }.padding(.horizontal, 17).padding(.vertical, 12)
        }
    }
}

// The journey surface represents only manual stop completion and a saved plan.
// Its expiry view never shows a stale destination or next-stop name.
private struct JourneyReadout {
    let context: ActivityViewContext<JourneyActivityAttributes>
    let now: Date
    var language: FlightLanguage { FlightLanguage(context.state.language) }
    var expired: Bool { context.isStale || context.state.ended || now >= context.attributes.expiresAt }
    var label: String { expired ? language.text("Gezi rehberi sona erdi", "Itinerary guide ended", "Udhëzuesi përfundoi") : language.text("Sıradaki durak", "Next stop", "Ndalesa tjetër") }
    var progress: String { "\(context.state.completed)/\(context.state.total)" }
}

private struct JourneySummary: View {
    let readout: JourneyReadout
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Label("LETSGO2TRAVEL", systemImage: "map.fill").font(.system(size: 10, weight: .bold)).foregroundStyle(Color.l2tGold)
                Spacer()
                if !readout.expired { Text(readout.progress).font(.system(size: 13, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color.l2tGold) }
            }
            Text(readout.label).font(.caption).foregroundStyle(.white.opacity(0.75))
            if !readout.expired {
                Text(readout.context.state.nextStopName).font(.system(size: 18, weight: .semibold, design: .rounded)).lineLimit(2).foregroundStyle(.white)
                if !readout.context.state.nextScheduledTime.isEmpty {
                    Text(readout.language.text("Planlanan saat", "Planned time", "Ora e planifikuar") + " · " + readout.context.state.nextScheduledTime + (readout.context.state.provisional ? readout.language.text(" · tahmini", " · estimate", " · vlerësim") : ""))
                        .font(.system(size: 11)).foregroundStyle(.white.opacity(0.75))
                }
                ProgressView(value: Double(readout.context.state.completed), total: Double(max(1, readout.context.state.total))).tint(.l2tGold)
                Text(readout.language.text("Durakları uygulamada tamamla", "Mark stops complete in the app", "Shëno ndalesat e kryera në aplikacion"))
                    .font(.system(size: 10)).foregroundStyle(.white.opacity(0.6))
            }
        }
    }
}

struct JourneyActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JourneyActivityAttributes.self) { context in
            TimelineView(.periodic(from: .now, by: 30)) { timeline in
                JourneySummary(readout: JourneyReadout(context: context, now: timeline.date)).padding(16)
            }
            .activityBackgroundTint(.l2tNight)
            .activitySystemActionForegroundColor(.l2tGold)
            .widgetURL(URL(string: context.attributes.deepLink))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: "map.fill").foregroundStyle(Color.l2tGold) }
                DynamicIslandExpandedRegion(.trailing) {
                    if !context.isStale && !context.state.ended && Date() < context.attributes.expiresAt {
                        Text("\(context.state.completed)/\(context.state.total)").monospacedDigit().font(.caption.bold()).foregroundStyle(Color.l2tGold)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    TimelineView(.periodic(from: .now, by: 30)) { timeline in
                        JourneySummary(readout: JourneyReadout(context: context, now: timeline.date))
                    }
                }
            } compactLeading: {
                Image(systemName: "map.fill").foregroundStyle(Color.l2tGold)
                    .accessibilityLabel(FlightLanguage(context.state.language).text("Gezi rehberi", "Itinerary guide", "Udhëzuesi"))
            } compactTrailing: {
                if context.isStale || context.state.ended || Date() >= context.attributes.expiresAt {
                    Image(systemName: "stop.circle").foregroundStyle(Color.l2tGold)
                } else {
                    Text("\(context.state.completed)/\(context.state.total)").font(.system(size: 12, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(Color.l2tGold)
                }
            } minimal: {
                Image(systemName: context.isStale || context.state.ended || Date() >= context.attributes.expiresAt ? "stop.circle" : "map.fill")
                    .foregroundStyle(Color.l2tGold)
            }
            .keylineTint(.l2tGold)
            .widgetURL(URL(string: context.attributes.deepLink))
        }
    }
}
