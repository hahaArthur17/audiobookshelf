// Ambient types for npm packages that ship no type definitions (no @types package is installed).
// Only the parts the converted server files use are described. Type-only: emits no code.
// tsconfig.server.json excludes **/*.d.ts from its include list, so a .ts file that needs these pulls the file in with /// <reference path>.

declare module 'uuid' {
  export function v4(): string
  // Used by server/controllers/ShareController.ts to check the share session cookie.
  export function validate(uuid: string): boolean
  export function version(uuid: string): number
}

// Used by server/managers/EmailManager.ts. from/to allow null because EmailSettings.fromAddress starts as null.
declare module 'nodemailer' {
  interface SendMailOptions {
    from?: string | null
    to?: string | null
    subject?: string
    text?: string
    html?: string
    attachments?: { filename: string; path: string }[]
  }
  interface Transporter {
    verify(): Promise<true>
    sendMail(mailOptions: SendMailOptions): Promise<unknown>
  }
  export function createTransport(options: object): Transporter
}

// Used by server/managers/MigrationManager.ts. Only gt, lte and compare are called. A value that is not a version string makes them throw a TypeError, so the parameters are strings.
declare module 'semver' {
  export function gt(v1: string, v2: string): boolean
  export function lte(v1: string, v2: string): boolean
  export function compare(v1: string, v2: string): 1 | 0 | -1
}
