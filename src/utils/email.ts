import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY!)

const sendWelcomeEmail = async (email: string, name: string) => {
    const previewText = "Get started with your new CoreBase workspace";

    const text = `
Welcome to CoreBase

Hi ${name}!

Welcome to CoreBase! We're excited to have you join our community of developers building the next generation of scalable applications.

Your workspace is ready. You can now start creating projects, defining schemas, and managing your backend effortlessly.

Go to Dashboard: https://corebase.trivyaa.in/platform

Here are a few things you can do to get started:
- Create your first Project
- Define your Database Schema
- Generate API Keys

Happy Coding,
The CoreBase Team

© ${new Date().getFullYear()} CoreBase. All rights reserved.
    `.trim();

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Welcome to CoreBase</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f5; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background-color: #f97316; padding: 30px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
            .content { padding: 40px 30px; }
            .welcome-text { font-size: 18px; margin-bottom: 20px; color: #18181b; }
            .btn { display: inline-block; background-color: #f97316; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px; text-align: center; transition: background-color 0.2s; }
            .btn:hover { background-color: #ea580c; }
            .footer { background-color: #f4f4f5; padding: 20px; text-align: center; font-size: 12px; color: #71717a; border-top: 1px solid #e4e4e7; }
            .links { margin-top: 10px; }
            .links a { color: #71717a; text-decoration: underline; margin: 0 10px; }
            /* Hidden Preheader */
            .preheader { display:none !important; visibility:hidden; mso-hide:all; font-size:1px; color:#ffffff; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden; }
        </style>
    </head>
    <body>
        <span class="preheader">${previewText}</span>
        <div class="container">
            <div class="header">
                <h1>Welcome to CoreBase</h1>
            </div>
            <div class="content">
                <p class="welcome-text">Hi ${name} 👋</p>
                <p>Welcome to <strong>CoreBase</strong>! We're excited to have you join our community of developers building the next generation of scalable applications.</p>
                <p>Your workspace is ready. You can now start creating projects, defining schemas, and managing your backend effortlessly.</p>
                
                <div style="text-align: center; margin: 35px 0;">
                    <a href="https://corebase.trivyaa.in/platform" class="btn">Go to Dashboard</a>
                </div>
                
                <p>Here are a few things you can do to get started:</p>
                <ul>
                    <li>Create your first <strong>Project</strong></li>
                    <li>Define your <strong>Database Schema</strong></li>
                    <li>Generate <strong>API Keys</strong></li>
                </ul>

                <p style="margin-top: 30px;">Happy Coding,<br/><strong>The CoreBase Team</strong></p>
            </div>
            <div class="footer">
                <p>&copy; ${new Date().getFullYear()} CoreBase. All rights reserved.</p>
                <p>You received this email because you signed up for CoreBase.</p>
                <div class="links">
                    <a href="https://corebase.trivyaa.in">Website</a>
                    <a href="https://corebase-docs.trivyaa.in">Documentation</a>
                </div>
            </div>
        </div>
    </body>
    </html>
    `

    const { data, error } = await resend.emails.send({
        from: "CoreBase <corebase@trivyaa.in>",
        to: email,
        subject: "Welcome to CoreBase! 🚀",
        html: html,
        text: text,
    })

    if (error) {
        console.error('Failed to send welcome email:', error)
    }
}

export { sendWelcomeEmail }

// sendWelcomeEmail("abhijitpradhan909@gmail.com", "Abhijit")