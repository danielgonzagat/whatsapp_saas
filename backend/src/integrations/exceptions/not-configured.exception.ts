export class NotConfiguredException extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly missingCredentials: string[],
  ) {
    super(message);
    this.name = 'NotConfiguredException';
  }
}
