export class PixaReauthenticationRequired extends Error {
  constructor() { super('Your Pixa connection expired. Reconnect Pixa to refresh your measurements.'); this.name = 'PixaReauthenticationRequired'; }
}