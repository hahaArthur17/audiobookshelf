const uaParserJs = require('../../libs/uaParser')

interface UserAgentInfo {
  browserName?: string
  browserVersion?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  model?: string
  vendor?: string
}

function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo | null {
  if (!userAgent) return null

  const ua = uaParserJs(userAgent)
  const deviceInfo: UserAgentInfo = {
    browserName: ua?.browser?.name || undefined,
    browserVersion: ua?.browser?.version || undefined,
    osName: ua?.os?.name || undefined,
    osVersion: ua?.os?.version || undefined,
    deviceType: ua?.device?.type || undefined,
    model: ua?.device?.model || undefined,
    vendor: ua?.device?.vendor || undefined
  }

  for (const key in deviceInfo) {
    const infoKey = key as keyof UserAgentInfo
    if (deviceInfo[infoKey] === undefined) delete deviceInfo[infoKey]
  }

  return Object.keys(deviceInfo).length ? deviceInfo : null
}

module.exports = parseUserAgent
