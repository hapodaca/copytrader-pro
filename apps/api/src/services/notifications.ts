// TODO v1.3 — Notification service (email, Telegram, WhatsApp)

export class NotificationService {
  async sendEmail(_to: string, _subject: string, _body: string): Promise<void> {
    // TODO v1.3
  }

  async sendTelegram(_chatId: string, _message: string): Promise<void> {
    // TODO v1.3
  }

  async sendWhatsApp(_phone: string, _message: string): Promise<void> {
    // TODO v1.3
  }
}

export const notificationService = new NotificationService();
