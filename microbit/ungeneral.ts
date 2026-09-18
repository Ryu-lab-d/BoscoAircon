// ============================================================================
// Nexus aircon monitor — SPECIAL (non-regular) room firmware.
//
// One of the 13 special rooms: CCComputer, CCMakerspace, CCLab, CCSmartBoard,
// CCAcedemic, CCActivity, CCRobotics, CCPhotography, CCMultimedia, CCArt,
// CCPresentation, CCLibrary, CCDrama. Unlike a general/homeroom classroom,
// a special room has no hardcoded default hours — it is off unless its own
// weekly chart, an event override, says otherwise, and never on during a
// holiday.
//
// Edit ROOM_ID (and the Wi-Fi/Telegram constants below) to this unit's own
// values before flashing. Everything else is identical across all 13 units.
// ============================================================================

// ==== Per-unit configuration — edit before flashing ====
const ROOM_ID = "CCLab"
const WIFI_SSID = "YOUR_WIFI_SSID"
const WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"
const TELEGRAM_API_KEY = "YOUR_TELEGRAM_BOT_API_KEY"
const TIME_ZONE_UTC_OFFSET = 7 // Thailand

// ==== Network ====
const LOCAL_UDP_PORT = 9000 // app broadcasts here; this is what we bind/listen on
const REMOTE_BROADCAST_PORT = 8080 // app's own sending port, per the AT+CIPSTART "remote port" arg
const FIELD_SEP = "|"

// ==== Behaviour ====
const CHECK_INTERVAL_MS = 180000 // 3 minutes
const AC_ON_TEMP_THRESHOLD = 25 // °C — aircon is inferred "on" when sensed temp <= this

// ============================================================================
// Wire format (agreed protocol v2):
//   <RoomId>|WD1|<slot>...|WD2|...|...|WD7|...|E|<date>|<slot>...|H|<range>...|T|<chatId>...
// A special room always gets all 7 WD markers (bare if that day has no
// windows). WD<n>, "E", "H", "T" are section markers; any section may be
// omitted entirely if it has nothing to say (e.g. no events right now).
// ============================================================================

interface TimeSlot {
    start: string
    end: string
    enabled: boolean
}

interface WeekDay {
    day: number
    slots: TimeSlot[]
}

interface EventDay {
    date: string
    slots: TimeSlot[]
}

interface HolidayRange {
    start: string
    end: string
}

interface Chart {
    weekDays: WeekDay[]
    events: EventDay[]
    holidays: HolidayRange[]
    trackers: string[]
}

let currentChart: Chart = { weekDays: [], events: [], holidays: [], trackers: [] }

// 在 MakeCode 中，通过判断 ASCII 码来检测是否为纯数字最安全
function isDigitStr(str: string): boolean {
    if (str.length === 0) return false;
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i);
        if (code < 48 || code > 57) { // 48-57 是 '0'-'9'
            return false;
        }
    }
    return true;
}

function pad2(n: number): string {
    return n < 10 ? "0" + n : "" + n
}

function pad4(n: number): string {
    let s = "" + n
    while (s.length < 4) {
        s = "0" + s
    }
    return s
}

function parseTimeSlot(input: string): TimeSlot | null {
    // 1050-1300 长度为 9; 1050-1300Y 长度为 10
    if (input.length !== 9 && input.length !== 10) {
        return null;
    }

    let startRaw = input.slice(0, 4);
    let separator = input.slice(4, 5);
    let endRaw = input.slice(5, 9);
    let flag = input.slice(9, 10);

    if (separator !== '-' || !isDigitStr(startRaw) || !isDigitStr(endRaw)) {
        return null;
    }

    return {
        start: startRaw,
        end: endRaw,
        enabled: flag !== "N"
    }
}

function isHolidayRangeToken(input: string): boolean {
    // YYYYMMDD-YYYYMMDD, length 17
    if (input.length !== 17) return false
    if (input.slice(8, 9) !== "-") return false
    return isDigitStr(input.slice(0, 8)) && isDigitStr(input.slice(9, 17))
}

function parseChart(input: string): Chart {
    let rawDts = input.split(FIELD_SEP);
    let dts: string[] = [];

    for (let i = 0; i < rawDts.length; i++) {
        let trimmed = rawDts[i].trim();
        if (trimmed.length > 0) {
            dts.push(trimmed);
        }
    }

    let result: Chart = {
        weekDays: [],
        events: [],
        holidays: [],
        trackers: []
    }

    let currentDay: WeekDay | null = null
    let currentEvent: EventDay | null = null

    // "WD" | "Event" | "Holiday" | "Trackers"
    let state = "";

    for (let i = 0; i < dts.length; i++) {
        let dt = dts[i];

        if (dt === "T") {
            state = "Trackers"
            currentDay = null
            currentEvent = null
            continue
        }

        if (state === "Trackers") {
            result.trackers.push(dt)
            continue
        }

        if (dt === "H") {
            state = "Holiday"
            currentDay = null
            currentEvent = null
            continue
        }

        if (state === "Holiday") {
            if (isHolidayRangeToken(dt)) {
                result.holidays.push({ start: dt.slice(0, 8), end: dt.slice(9, 17) })
            }
            continue
        }

        if (dt.indexOf("W") === 0) {
            let numPart = dt.slice(1);
            let bracketIndex = numPart.indexOf("(");
            if (bracketIndex !== -1) {
                numPart = numPart.slice(0, bracketIndex);
            }

            if (isDigitStr(numPart)) {
                currentDay = {
                    day: parseInt(numPart),
                    slots: []
                }
                result.weekDays.push(currentDay)
                currentEvent = null
                state = "WD"
                continue
            }
        }

        if (dt === "E") {
            state = "Event"
            currentDay = null
            currentEvent = null
            continue
        }

        if (state === "Event") {
            // An 8-digit token always starts the next day's event group.
            if (dt.length === 8 && isDigitStr(dt)) {
                currentEvent = { date: dt, slots: [] }
                result.events.push(currentEvent)
                continue
            }
            let slot = parseTimeSlot(dt)
            if (slot && currentEvent) {
                currentEvent.slots.push(slot)
            }
            continue
        }

        let slot = parseTimeSlot(dt)
        if (slot && state === "WD" && currentDay) {
            currentDay.slots.push(slot)
        }
    }

    return result
}

let rxData = ""

function sendCommand(command: string, expected_response: string = null, timeout: number = 100): boolean {
    // Wait a while from previous command.
    basic.pause(10)

    // Flush the Rx buffer.
    serial.readString()
    rxData = ""

    // Send the command and end with "\r\n".
    serial.writeString(command + "\r\n")

    // Don't check if expected response is not specified.
    if (expected_response == null) {
        return true
    }

    // Wait and verify the response.
    let result = false
    let timestamp = input.runningTime()
    while (true) {
        // Timeout.
        if (input.runningTime() - timestamp > timeout) {
            result = false
            break
        }

        // Read until the end of the line.
        rxData += serial.readString()
        if (rxData.includes("\r\n")) {
            // Check if expected response received.
            if (rxData.slice(0, rxData.indexOf("\r\n")).includes(expected_response)) {
                result = true
                break
            }

            // If we expected "OK" but "ERROR" is received, do not wait for timeout.
            if (expected_response == "OK") {
                if (rxData.slice(0, rxData.indexOf("\r\n")).includes("ERROR")) {
                    result = false
                    break
                }
            }

            // Trim the Rx data before loop again.
            rxData = rxData.slice(rxData.indexOf("\r\n") + 2)
        }
    }

    return result
}

// ============================================================================
// UDP receive.
//
// No documented block was given for "listen for a UDP broadcast and get the
// payload" — only send-oriented esp8266 calls (sendCommand, sendTelegramMessage)
// were specified. This opens a UDP socket the standard ESP8266 AT-firmware way
// (mode 2 = remote peer tracks the last sender, which is what a broadcast
// receiver needs since it doesn't know the phone's address ahead of time) and
// scans the raw serial stream for "+IPD,<link>,<len>:<payload>" frames. If the
// extension actually exposes a friendlier receive block, swap it in here.
// ============================================================================

let rxBuffer = ""

function isForThisRoom(payload: string): boolean {
    return payload.indexOf(ROOM_ID + FIELD_SEP) === 0
}

function pollIncoming(): void {
    let chunk = serial.readString()
    if (chunk.length > 0) {
        rxBuffer += chunk
    }

    // Don't let unrelated AT chatter grow this forever.
    if (rxBuffer.length > 2048) {
        rxBuffer = rxBuffer.slice(rxBuffer.length - 512)
    }

    while (true) {
        let ipdIndex = rxBuffer.indexOf("+IPD,")
        if (ipdIndex === -1) {
            return
        }
        if (ipdIndex > 0) {
            rxBuffer = rxBuffer.slice(ipdIndex)
        }

        let colonIndex = rxBuffer.indexOf(":")
        if (colonIndex === -1) {
            return // header not fully received yet
        }

        let headerParts = rxBuffer.slice(0, colonIndex).split(",")
        if (headerParts.length < 3 || !isDigitStr(headerParts[2])) {
            // Malformed header — drop it and keep scanning past it.
            rxBuffer = rxBuffer.slice(colonIndex + 1)
            continue
        }

        let payloadLen = parseInt(headerParts[2])
        let payloadStart = colonIndex + 1
        if (rxBuffer.length < payloadStart + payloadLen) {
            return // payload hasn't fully arrived yet
        }

        let payload = rxBuffer.slice(payloadStart, payloadStart + payloadLen)
        rxBuffer = rxBuffer.slice(payloadStart + payloadLen)

        if (isForThisRoom(payload)) {
            currentChart = parseChart(payload.slice(ROOM_ID.length + 1))
        }
    }
}

// ============================================================================
// Schedule evaluation.
// ============================================================================

// Holiday, then today's event override, then the weekly chart — first match
// wins. A special room has no hardcoded default: no match anywhere means off.
function shouldBeOn(chart: Chart, weekDay: number, nowHHMM: string, todayStr: string): boolean {
    for (let i = 0; i < chart.holidays.length; i++) {
        let h = chart.holidays[i]
        if (todayStr >= h.start && todayStr <= h.end) {
            return false
        }
    }

    for (let i = 0; i < chart.events.length; i++) {
        let ev = chart.events[i]
        if (ev.date === todayStr) {
            for (let j = 0; j < ev.slots.length; j++) {
                let slot = ev.slots[j]
                if (nowHHMM >= slot.start && nowHHMM <= slot.end) {
                    return slot.enabled
                }
            }
        }
    }

    for (let i = 0; i < chart.weekDays.length; i++) {
        let wd = chart.weekDays[i]
        // Assumes esp8266.getWeekDay() returns 1=Monday..7=Sunday, matching
        // the wire protocol's WD1=Monday. Adjust here if it doesn't.
        if (wd.day === weekDay) {
            for (let j = 0; j < wd.slots.length; j++) {
                let slot = wd.slots[j]
                if (nowHHMM >= slot.start && nowHHMM <= slot.end) {
                    return slot.enabled
                }
            }
        }
    }

    return false
}

function checkAirconState(): void {
    esp8266.updateInternetTime()
    let hour = esp8266.getHour()
    let minute = esp8266.getMinute()
    let second = esp8266.getSecond()
    let weekDay = esp8266.getWeekDay()
    let dateNum = esp8266.getDate()
    let month = esp8266.getMonth()
    let year = esp8266.getYear()

    timeanddate.set24HourTime(hour, minute, second)

    let nowHHMM = pad2(hour) + pad2(minute)
    let todayStr = pad4(year) + pad2(month) + pad2(dateNum)

    let allowed = shouldBeOn(currentChart, weekDay, nowHHMM, todayStr)

    dht11_dht22.queryData(DHTtype.DHT11, DigitalPin.P0, true, false, true)
    let temperature = dht11_dht22.readData(dataType.temperature)
    let acAppearsOn = temperature <= AC_ON_TEMP_THRESHOLD

    if (!allowed && acAppearsOn) {
        let msg = "[" + ROOM_ID + "] Aircon appears ON outside allowed hours (sensed " + temperature + "C). Please check."
        for (let i = 0; i < currentChart.trackers.length; i++) {
            esp8266.sendTelegramMessage(TELEGRAM_API_KEY, currentChart.trackers[i], msg)
        }
    }
}

// ============================================================================
// Setup and main loops.
// ============================================================================

function setup(): void {
    esp8266.init(SerialPin.P16, SerialPin.P15, BaudRate.BaudRate115200)
    esp8266.connectWifi(WIFI_SSID, WIFI_PASSWORD)
    esp8266.initInternetTime(TIME_ZONE_UTC_OFFSET)
    esp8266.updateInternetTime()

    sendCommand("AT+CIPMUX=1", "OK", 2000)
    sendCommand("AT+CIPSTART=0,\"UDP\",\"255.255.255.255\"," + REMOTE_BROADCAST_PORT + "," + LOCAL_UDP_PORT + ",2", "OK", 2000)
}

setup()

basic.forever(function () {
    pollIncoming()
    basic.pause(150)
})

basic.forever(function () {
    checkAirconState()
    basic.pause(CHECK_INTERVAL_MS)
})
