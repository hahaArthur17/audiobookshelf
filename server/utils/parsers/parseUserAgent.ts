import uaParserJs = require('../../libs/uaParser')

/** The part of a UAParser.js result that is read here (the vendored parser is untyped and returns any). A field is undefined when nothing matched. */
interface UAParserResult {
  browser: { name?: string; version?: string }
  os: { name?: string; version?: string }
  device: { type?: string; model?: string; vendor?: string }
}

/** Device details for display; only the fields that could be detected are present */
interface DeviceInfo {
  browserName?: string
  browserVersion?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  model?: string
  vendor?: string
}

/**
 * @param {string|null|undefined} userAgent
 * @returns {{ browserName?:string, browserVersion?:string, osName?:string, osVersion?:string, deviceType?:string, model?:string, vendor?:string }|null}
 */
function parseUserAgent(userAgent: string | null | undefined): DeviceInfo | null {
  if (!userAgent) return null

  const ua: UAParserResult = uaParserJs(userAgent)
  const deviceInfo: DeviceInfo = {
    browserName: ua?.browser?.name || undefined,
    browserVersion: ua?.browser?.version || undefined,
    osName: ua?.os?.name || undefined,
    osVersion: ua?.os?.version || undefined,
    deviceType: ua?.device?.type || undefined,
    model: ua?.device?.model || undefined,
    vendor: ua?.device?.vendor || undefined
  }

  for (const key in deviceInfo) {
    if (deviceInfo[key as keyof DeviceInfo] === undefined) delete deviceInfo[key as keyof DeviceInfo]
  }

  return Object.keys(deviceInfo).length ? deviceInfo : null
}

export = parseUserAgent
