/**
 * Arena-adapter: speiler et Amerikaner-parti og svarer med MesterAI-beslutninger.
 *
 * Prosessen leser NDJSON (én JSON-melding per linje) på stdin og svarer med én
 * JSON-linje per melding på stdout. TypeScript-motoren i dette repoet er
 * autoritet: den deler ut kortene, validerer alle handlinger og fører poeng.
 * Adapteren holder en identisk `GameEngine` (appens motor) i synk ved å få
 * tilsendt hver utførte handling, slik at MesterAI/AIPlayer kan spørres med
 * nøyaktig samme informasjon som i appen.
 *
 * Meldinger inn:
 *   {"type":"init","mesterSeter":[0,2],"tidsbudsjettMs":450,...}
 *   {"type":"nyKamp","mesterSeter":[1,3]}
 *   {"type":"rundeStart","hender":[["SA","H10",...],...],"talong":["S2",...],"foersteBudgiver":1}
 *   {"type":"handling","handling":{"type":"BUD","spiller":2,"bud":"PASS"}}
 *   {"type":"beslutt","sete":2}
 *
 * Svar:
 *   {"type":"ok","fase":"budrunde","poeng":[0,0,0,0],"iTur":1}
 *   {"type":"handling","handling":{...}}          (på "beslutt")
 *   {"type":"feil","melding":"..."}
 *
 * Kort kodes som kompakte id-er i motorens format: "SA", "H10", "K2"
 * (farge S/H/R/K + verdi 2–10/J/Q/K/A).
 *
 * Poengsynk på tvers av runder: appens motor lar oss ikke sette poengsummer
 * direkte, så ved hver rundestart bygges motoren opp på nytt ved å spille av
 * alle ferdige runder (samme utdelinger, samme handlinger). Det er billig og
 * garanterer at MesterAIs matchbevisste budgivning ser riktige poengsummer.
 */

import Foundation

// MARK: - Kort-id-er

func suitFraTegn(_ c: Character) -> Suit? {
    switch c {
    case "S": return .spar
    case "H": return .hjerter
    case "R": return .ruter
    case "K": return .kløver
    default: return nil
    }
}

func tegnFraSuit(_ s: Suit) -> String {
    switch s {
    case .spar: return "S"
    case .hjerter: return "H"
    case .ruter: return "R"
    case .kløver: return "K"
    }
}

func kortFraId(_ id: String) -> Card? {
    guard let første = id.first, let suit = suitFraTegn(første) else { return nil }
    let rest = String(id.dropFirst())
    let verdi: Int?
    switch rest {
    case "J": verdi = 11
    case "Q": verdi = 12
    case "K": verdi = 13
    case "A": verdi = 14
    default: verdi = Int(rest)
    }
    guard let v = verdi, let rank = Rank(rawValue: v) else { return nil }
    return Card(suit: suit, rank: rank)
}

func idFraKort(_ k: Card) -> String {
    let v: String
    switch k.rank {
    case .jack: v = "J"
    case .queen: v = "Q"
    case .king: v = "K"
    case .ace: v = "A"
    default: v = String(k.rank.rawValue)
    }
    return tegnFraSuit(k.suit) + v
}

// MARK: - Feil

struct AdapterFeil: Error {
    let melding: String
    init(_ melding: String) { self.melding = melding }
}

// MARK: - Handlinger (motorens JSON-format)

enum Handling {
    case bud(spiller: Int, action: BidAction)
    case vrak(spiller: Int, kort: [Card])
    case velg(spiller: Int, trumf: Suit, etterlyst: Card?)
    case spill(spiller: Int, kort: Card)

    static func fra(json: [String: Any]) throws -> Handling {
        guard let type = json["type"] as? String,
              let spiller = json["spiller"] as? Int else {
            throw AdapterFeil("handling mangler type/spiller")
        }
        switch type {
        case "BUD":
            let action: BidAction
            if let n = json["bud"] as? Int {
                action = .bud(n)
            } else if let s = json["bud"] as? String {
                switch s {
                case "PASS": action = .pass
                case "AMERIKANER": action = .amerikaner
                case "SOLO": action = .soloAmerikaner
                default: throw AdapterFeil("ukjent bud: \(s)")
                }
            } else {
                throw AdapterFeil("BUD mangler bud-felt")
            }
            return .bud(spiller: spiller, action: action)
        case "VRAK":
            guard let ids = json["kort"] as? [String] else { throw AdapterFeil("VRAK mangler kort") }
            let kort = try ids.map { id -> Card in
                guard let k = kortFraId(id) else { throw AdapterFeil("ugyldig kort-id: \(id)") }
                return k
            }
            return .vrak(spiller: spiller, kort: kort)
        case "VELG":
            guard let ts = json["trumf"] as? String, let tegn = ts.first,
                  let trumf = suitFraTegn(tegn) else { throw AdapterFeil("VELG mangler trumf") }
            var etterlyst: Card?
            if let id = json["etterlyst"] as? String {
                guard let k = kortFraId(id) else { throw AdapterFeil("ugyldig etterlyst: \(id)") }
                etterlyst = k
            }
            return .velg(spiller: spiller, trumf: trumf, etterlyst: etterlyst)
        case "SPILL":
            guard let id = json["kort"] as? String, let kort = kortFraId(id) else {
                throw AdapterFeil("SPILL mangler kort")
            }
            return .spill(spiller: spiller, kort: kort)
        default:
            throw AdapterFeil("ukjent handlingstype: \(type)")
        }
    }

    var somJson: [String: Any] {
        switch self {
        case .bud(let spiller, let action):
            let bud: Any
            switch action {
            case .pass: bud = "PASS"
            case .amerikaner: bud = "AMERIKANER"
            case .soloAmerikaner: bud = "SOLO"
            case .bud(let n): bud = n
            }
            return ["type": "BUD", "spiller": spiller, "bud": bud]
        case .vrak(let spiller, let kort):
            return ["type": "VRAK", "spiller": spiller, "kort": kort.map(idFraKort)]
        case .velg(let spiller, let trumf, let etterlyst):
            var ut: [String: Any] = ["type": "VELG", "spiller": spiller, "trumf": tegnFraSuit(trumf)]
            ut["etterlyst"] = etterlyst.map(idFraKort) ?? NSNull()
            return ut
        case .spill(let spiller, let kort):
            return ["type": "SPILL", "spiller": spiller, "kort": idFraKort(kort)]
        }
    }
}

// MARK: - Botene adapteren kan betjene

/// Én AI som adapteren spiller for et sete. Alle er appens egen kode:
///  - `.ai`  dekker heuristikk-gradene (lett/middels/vanskelig) og
///           President-nivået (`.president` = MesterAI + NevroHjerne).
///  - `.nevro` er det rene nevrale nettet for bud/bytte/spill. Nettet har
///           ingen trumf-head, så trumf/etterlysning tas av en heuristisk
///           reserve (Vanskelig) – ellers er alle valg nettets egne.
enum ArenaBot {
    case ai(AIPlayer)
    case nevro(NevroSpiller, AIPlayer)

    func velgBud(_ e: GameEngine) -> BidAction {
        switch self {
        case .ai(let p): return p.velgBud(engine: e)
        case .nevro(let n, _): return n.velgBud(engine: e)
        }
    }
    func velgByttekort(_ e: GameEngine) -> [Card] {
        switch self {
        case .ai(let p): return p.velgByttekort(engine: e)
        case .nevro(let n, _): return n.velgByttekort(engine: e)
        }
    }
    func velgTrumfOgMakker(_ e: GameEngine) -> (Suit, Card?)? {
        switch self {
        case .ai(let p): return p.velgTrumfOgMakker(engine: e)
        case .nevro(_, let reserve): return reserve.velgTrumfOgMakker(engine: e)
        }
    }
    func velgKort(_ e: GameEngine) -> Card? {
        switch self {
        case .ai(let p): return p.velgKort(engine: e)
        case .nevro(let n, _): return n.velgKort(engine: e)
        }
    }
}

func lagBot(type: String, sete: Int) -> ArenaBot? {
    switch type {
    case "mester", "president":
        return .ai(AIPlayer(seat: sete, difficulty: .president, personality: .balansert))
    case "vanskelig":
        return .ai(AIPlayer(seat: sete, difficulty: .vanskelig, personality: .balansert))
    case "middels":
        return .ai(AIPlayer(seat: sete, difficulty: .middels, personality: .balansert))
    case "lett":
        return .ai(AIPlayer(seat: sete, difficulty: .lett, personality: .balansert))
    case "nevro":
        guard let hjerne = NevroHjerne.delt else { return nil }
        return .nevro(NevroSpiller(sete: sete, hjerne: hjerne),
                      AIPlayer(seat: sete, difficulty: .vanskelig, personality: .balansert))
    default:
        return nil
    }
}

// MARK: - Broen: speilmotor + adapter-seter

/// En ferdigspilt rundes fulle fasit, nok til å spille den av på nytt.
struct Rundelogg {
    let hender: [[Card]]
    let talon: [Card]
    let førsteBudgiver: Int
    var handlinger: [Handling]
}

final class Bro {
    let regler = GameRules()   // 4 spillere, byttekort, mål 100 – som motoren
    var engine: GameEngine
    var adapterBots: [Int: ArenaBot] = [:]
    var ferdigeRunder: [Rundelogg] = []
    var gjeldende: Rundelogg?

    init() {
        engine = GameEngine(rules: regler)
    }

    func konfigurer(json: [String: Any]) {
        // MesterAI-konfig: start fra maskinvaretilpasset standard og overstyr
        // feltene arenaen ber om (særlig tidsbudsjettet per kortvalg).
        var k = MesterKonfig.automatisk()
        if let ms = json["tidsbudsjettMs"] as? Int { k.tidsbudsjett = Double(ms) / 1000 }
        if let n = json["maksVerdener"] as? Int { k.maksVerdener = n }
        if let n = json["minVerdener"] as? Int { k.minVerdener = n }
        if let n = json["verdenerVedBud"] as? Int { k.verdenerVedBud = n }
        if let n = json["verdenerVedBytte"] as? Int { k.verdenerVedBytte = n }
        if let n = json["eksaktStikkGrense"] as? Int { k.eksaktStikkGrense = n }
        MesterAI.overstyrKonfig = k
    }

    /// Starter en ny kamp. `bots` kartlegger sete → bot-type for de setene
    /// adapteren skal spille; øvrige seter drives av TypeScript-motoren.
    func nyKamp(bots: [Int: String]) throws {
        ferdigeRunder = []
        gjeldende = nil
        engine = GameEngine(rules: regler)
        adapterBots = [:]
        for (sete, type) in bots {
            guard let bot = lagBot(type: type, sete: sete) else {
                throw AdapterFeil("ukjent eller utilgjengelig bot-type «\(type)» for sete \(sete)")
            }
            adapterBots[sete] = bot
        }
    }

    func rundeStart(json: [String: Any]) throws {
        guard let henderIds = json["hender"] as? [[String]],
              let talongIds = json["talong"] as? [String],
              let førsteBudgiver = json["foersteBudgiver"] as? Int else {
            throw AdapterFeil("rundeStart mangler hender/talong/foersteBudgiver")
        }
        let hender = try henderIds.map { rad in
            try rad.map { id -> Card in
                guard let k = kortFraId(id) else { throw AdapterFeil("ugyldig kort-id: \(id)") }
                return k
            }
        }
        let talong = try talongIds.map { id -> Card in
            guard let k = kortFraId(id) else { throw AdapterFeil("ugyldig kort-id: \(id)") }
            return k
        }

        // Bygg motoren på nytt: spill av alle ferdige runder (gir riktige
        // poengsummer), og start så den nye runden med motorens utdeling.
        engine = GameEngine(rules: regler)
        for runde in ferdigeRunder {
            engine.startRunde(hender: runde.hender, talon: runde.talon,
                              førsteBudgiver: runde.førsteBudgiver)
            for handling in runde.handlinger {
                try bruk(handling: handling, logg: false)
            }
            guard engine.phase == .rundeFerdig else {
                throw AdapterFeil("avspilt runde endte i fasen \(engine.phase.rawValue)")
            }
        }
        engine.startRunde(hender: hender, talon: talong, førsteBudgiver: førsteBudgiver)
        gjeldende = Rundelogg(hender: hender, talon: talong,
                              førsteBudgiver: førsteBudgiver, handlinger: [])
    }

    func bruk(handling: Handling, logg: Bool) throws {
        let ok: Bool
        switch handling {
        case .bud(let spiller, let action):
            ok = engine.giBud(seat: spiller, action: action)
        case .vrak(let spiller, let kort):
            ok = engine.kastByttekort(kort, seat: spiller)
        case .velg(_, let trumf, let etterlyst):
            ok = engine.velgTrumf(suit: trumf, ønsket: etterlyst)
        case .spill(let spiller, let kort):
            ok = engine.spill(kort: kort, seat: spiller)
        }
        guard ok else {
            throw AdapterFeil("motoren avviste handlingen \(handling.somJson) i fasen \(engine.phase.rawValue)")
        }
        if logg {
            gjeldende?.handlinger.append(handling)
            // Runden er ferdigspilt: arkiver fasiten for senere avspilling.
            if engine.phase == .rundeFerdig || engine.phase == .spillFerdig,
               let runde = gjeldende {
                ferdigeRunder.append(runde)
                gjeldende = nil
            }
        }
    }

    /// MesterAI-setets beslutning i gjeldende fase. Handlingen UTFØRES ikke
    /// her – arenaen validerer den i sin motor og sender den tilbake som en
    /// vanlig "handling"-melding, så begge motorene følger samme spor.
    func beslutt(sete: Int) throws -> Handling {
        guard let bot = adapterBots[sete] else {
            throw AdapterFeil("sete \(sete) betjenes ikke av adapteren")
        }
        switch engine.phase {
        case .budrunde:
            guard engine.aktivBudgiver == sete else {
                throw AdapterFeil("sete \(sete) er ikke i tur (budrunde)")
            }
            return .bud(spiller: sete, action: bot.velgBud(engine))
        case .byttekort:
            let kort = bot.velgByttekort(engine)
            guard kort.count == regler.antallByttekort else {
                throw AdapterFeil("byttekort-valget ga \(kort.count) kort")
            }
            return .vrak(spiller: sete, kort: kort)
        case .velgTrumf:
            guard let (trumf, etterlyst) = bot.velgTrumfOgMakker(engine) else {
                throw AdapterFeil("velgTrumfOgMakker ga ikke noe valg")
            }
            return .velg(spiller: sete, trumf: trumf, etterlyst: etterlyst)
        case .spill:
            guard engine.aktivSpiller == sete else {
                throw AdapterFeil("sete \(sete) er ikke i tur (spill)")
            }
            guard let kort = bot.velgKort(engine) else {
                throw AdapterFeil("velgKort ga ikke noe kort")
            }
            return .spill(spiller: sete, kort: kort)
        default:
            throw AdapterFeil("kan ikke beslutte i fasen \(engine.phase.rawValue)")
        }
    }

    func status() -> [String: Any] {
        let iTur: Int
        switch engine.phase {
        case .budrunde: iTur = engine.aktivBudgiver
        case .byttekort, .velgTrumf: iTur = engine.budgiverSeat ?? -1
        case .spill: iTur = engine.aktivSpiller
        default: iTur = -1
        }
        return ["type": "ok", "fase": engine.phase.rawValue,
                "poeng": engine.scores, "iTur": iTur]
    }
}

// MARK: - Hovedløkke

func send(_ obj: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: obj)
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
}

let bro = Bro()

/// Bot-kartet fra en melding: enten `adapterBots` ({"0":"vanskelig",...}) eller
/// det eldre `mesterSeter` ([0,2] → alle mester). Manglende felt gir tom kamp.
func botKart(_ json: [String: Any]) -> [Int: String] {
    if let bots = json["adapterBots"] as? [String: String] {
        var ut: [Int: String] = [:]
        for (nøkkel, type) in bots { if let s = Int(nøkkel) { ut[s] = type } }
        return ut
    }
    if let seter = json["mesterSeter"] as? [Int] {
        return Dictionary(uniqueKeysWithValues: seter.map { ($0, "mester") })
    }
    return [:]
}

while let linje = readLine(strippingNewline: true) {
    guard !linje.isEmpty else { continue }
    do {
        guard let data = linje.data(using: .utf8),
              let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            throw AdapterFeil("kunne ikke tolke meldingen")
        }
        switch type {
        case "init":
            bro.konfigurer(json: json)
            try bro.nyKamp(bots: botKart(json))
            send(bro.status())
        case "nyKamp":
            try bro.nyKamp(bots: botKart(json))
            send(bro.status())
        case "rundeStart":
            try bro.rundeStart(json: json)
            send(bro.status())
        case "handling":
            guard let hj = json["handling"] as? [String: Any] else {
                throw AdapterFeil("mangler handling-objekt")
            }
            try bro.bruk(handling: Handling.fra(json: hj), logg: true)
            send(bro.status())
        case "beslutt":
            guard let sete = json["sete"] as? Int else { throw AdapterFeil("mangler sete") }
            let handling = try bro.beslutt(sete: sete)
            send(["type": "handling", "handling": handling.somJson])
        case "avslutt":
            exit(0)
        default:
            throw AdapterFeil("ukjent meldingstype: \(type)")
        }
    } catch let feil as AdapterFeil {
        send(["type": "feil", "melding": feil.melding])
    } catch {
        send(["type": "feil", "melding": "\(error)"])
    }
}
