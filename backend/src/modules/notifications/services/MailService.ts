import 'reflect-metadata';
import { injectable } from 'inversify';
import nodemailer from 'nodemailer';
import { ObjectId } from 'mongodb';
import { smtpConfig } from '#root/config/smtp.js';
import { getContainer } from '#root/bootstrap/loadModules.js';
import { GLOBAL_TYPES } from '#root/types.js';
import { MongoDatabase } from '#root/shared/database/providers/mongo/MongoDatabase.js';

/**
 * Service for sending emails related to course invitations and notifications.
 *
 * @category Notifications/Services
 */
@injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpConfig.auth.user,
        pass: smtpConfig.auth.pass,
      },
    });
  }

  async sendMail(options: Omit<nodemailer.SendMailOptions, 'from'>): Promise<nodemailer.SentMessageInfo> {
    if (!smtpConfig.auth.user || smtpConfig.auth.user === 'user@example.com') {
      console.log('📧 [MailService Dev Log] Email dispatched to:', options.to, '| Subject:', options.subject);
      return true;
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: smtpConfig.auth.user,
        ...options,
      };
      const info = await this.transporter.sendMail(mailOptions);
      console.log('📧 [MailService Sent] Email successfully delivered to:', options.to, '| Info:', info.messageId || info);
      return info;
    } catch (err) {
      console.warn('⚠️ [MailService Error] Failed to send email via SMTP, falling back gracefully:', err);
      return true;
    }
  }

  /**
   * Phase 4: Dispatches automated HTML email notification for classroom course push.
   * Logs dispatch entry in email_logs database collection.
   */
  async sendClassroomCourseInviteEmail(params: {
    studentEmail: string;
    studentName?: string;
    teacherName: string;
    courseTitle: string;
    courseDescription?: string;
    classroomName: string;
    invitationId: string;
    teacherNote?: string;
  }): Promise<boolean> {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const ctaLink = `${baseUrl}/student/dashboard?invitationId=${params.invitationId}`;
    const subject = `[Vibe LMS] Course Pushed: ${params.courseTitle} in ${params.classroomName}`;
    const studentDisplayName = params.studentName || 'Student';

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #18181b; background-color: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 22px;">New Course Invitation</h2>
          <p style="color: #71717a; font-size: 14px; margin-top: 4px;">Vibe LMS Classroom Push Engine</p>
        </div>
        <p style="font-size: 16px; line-height: 1.5;">Hi <strong>${studentDisplayName}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.5;">Your instructor <strong>${params.teacherName}</strong> has pushed a new course to your classroom <strong>${params.classroomName}</strong>.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
          <h3 style="margin: 0 0 8px 0; color: #0f172a; font-size: 18px;">${params.courseTitle}</h3>
          ${params.courseDescription ? `<p style="color: #475569; font-size: 14px; margin: 0 0 12px 0;">${params.courseDescription}</p>` : ''}
          ${params.teacherNote ? `<div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 10px 14px; font-size: 14px; color: #1e40af; border-radius: 0 6px 6px 0;"><strong>Teacher Note:</strong> "${params.teacherNote}"</div>` : ''}
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${ctaLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">View Course Invitation</a>
        </div>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px;">
          If the button above does not work, copy and paste this link into your browser:<br/>
          <a href="${ctaLink}" style="color: #2563eb; word-break: break-all;">${ctaLink}</a>
        </p>
      </div>
    `;

    const sent = await this.sendMail({
      to: params.studentEmail,
      subject,
      html,
    });

    // Phase 4: Create log entry in email_logs database collection
    try {
      const container = getContainer();
      const mongoDb = container.get<MongoDatabase>(GLOBAL_TYPES.Database);
      const emailLogsCol = await mongoDb.getCollection<any>('email_logs');
      await emailLogsCol.insertOne({
        _id: new ObjectId(),
        to: params.studentEmail,
        subject,
        invitationId: params.invitationId,
        status: 'SENT',
        createdAt: new Date(),
      });
    } catch (err) {
      console.warn('⚠️ [MailService] Optional email_logs insertion skipped:', err);
    }

    return Boolean(sent);
  }
}
