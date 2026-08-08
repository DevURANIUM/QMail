# QMail

QMail یک پنل ایمیل self-hosted است که با Vue 3 و Cloudflare Workers ساخته شده است. ایمیل‌های ورودی از طریق Cloudflare Email Routing دریافت و داخل D1 ذخیره می‌شوند و ایمیل‌های خروجی با Brevo ارسال می‌شوند.

## امکانات

- Inbox، Sent، جست‌وجو و نمایش کامل پیام
- انتخاب چندتایی، حذف گروهی، خوانده/خوانده‌نشده و Star
- نمایش HTML ایمیل و دانلود امن Attachment
- تم روشن و تاریک و رابط واکنش‌گرا
- تنظیم Cloudflare و Brevo از داخل پنل
- محافظت پنل با رمز عبور

## ساختار پروژه

```text
frontend/                         رابط Vue 3 + Vite
packages/worker/                  Worker، API و schema دیتابیس D1
packages/cloudflare-email-api/    کلاینت Cloudflare Email Routing
packages/brevo-api/               کلاینت ارسال ایمیل Brevo
```

فایل‌های build، دیتابیس محلی، توکن‌ها و تنظیمات شخصی Cloudflare عمداً داخل Repository قرار نمی‌گیرند.

## پیش‌نیازها

- Node.js نسخه 18 یا جدیدتر
- pnpm
- حساب Cloudflare
- دامنه‌ای که DNS آن روی Cloudflare فعال باشد
- حساب Brevo برای ارسال ایمیل

اگر pnpm نصب نیست:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

بررسی نصب:

```powershell
node --version
pnpm --version
```

## اجرای سریع روی سیستم شخصی

در PowerShell وارد پوشه پروژه شوید:

```powershell
cd C:\path\to\QMail
pnpm install
Copy-Item packages\worker\wrangler.toml.example packages\worker\wrangler.toml
pnpm build:frontend
pnpm db:migrate
pnpm dev
```

سپس این آدرس را باز کنید:

```text
http://localhost:8787
```

دستور `pnpm db:migrate` فقط دیتابیس محلی Wrangler را می‌سازد و به دیتابیس Cloudflare دست نمی‌زند.

برای Hot Reload رابط کاربری، `pnpm dev` را باز نگه دارید و در ترمینال دوم اجرا کنید:

```powershell
pnpm dev:frontend
```

سپس `http://localhost:5173` را باز کنید. درخواست‌های `/api` به Worker روی پورت `8787` منتقل می‌شوند.

در macOS و Linux به‌جای `Copy-Item` از این دستور استفاده کنید:

```bash
cp packages/worker/wrangler.toml.example packages/worker/wrangler.toml
```

## راه‌اندازی کامل Cloudflare

### 1. اضافه‌کردن دامنه به Cloudflare

دامنه باید در Cloudflare فعال باشد. اگر هنوز اضافه نشده است:

1. وارد Cloudflare Dashboard شوید.
2. گزینه **Add a domain** را انتخاب کنید.
3. دامنه را اضافه و Plan را انتخاب کنید.
4. Name Serverهای نمایش‌داده‌شده را در پنل ثبت‌کننده دامنه جایگزین کنید.
5. صبر کنید وضعیت Zone در Cloudflare به **Active** تغییر کند.

برای جلوگیری از دادن دسترسی اضافه، بهتر است دامنه قبل از اجرای Setup داخل Cloudflare فعال شده باشد.

### 2. ورود Wrangler به حساب Cloudflare

این ورود فقط برای ساخت D1 و Deploy کردن Worker است:

```powershell
pnpm exec wrangler login
pnpm exec wrangler whoami
```

مرورگر باز می‌شود و باید دسترسی Wrangler را تأیید کنید. API Token پنل QMail که در مرحله بعد می‌سازیم، با این ورود فرق دارد.

### 3. ساخت دیتابیس D1

از ریشه پروژه اجرا کنید:

```powershell
pnpm exec wrangler d1 create qmail-db
```

Cloudflare یک `database_id` برمی‌گرداند. فایل نمونه را کپی کنید:

```powershell
Copy-Item packages\worker\wrangler.toml.example packages\worker\wrangler.toml
```

فایل `packages/worker/wrangler.toml` را باز کنید و مقدار صفر را با شناسه واقعی جایگزین کنید:

```toml
[[d1_databases]]
binding = "DB"
database_name = "qmail-db"
database_id = "YOUR_REAL_D1_DATABASE_ID"
```

نام Worker در همین فایل باید `qmail` باقی بماند، چون Setup برنامه Catch-all را به همین Worker وصل می‌کند:

```toml
name = "qmail"
```

فایل `wrangler.toml` در `.gitignore` قرار دارد و نباید در GitHub Commit شود.

### 4. ساخت جدول‌های دیتابیس و Deploy

```powershell
pnpm install
pnpm build:frontend
pnpm db:migrate:prod
pnpm deploy
```

در پایان، Wrangler آدرسی شبیه این نمایش می‌دهد:

```text
https://qmail.YOUR-SUBDOMAIN.workers.dev
```

این آدرس را باز کنید و رمز مدیر QMail را بسازید.

### 5. فعال‌کردن Email Routing و ساخت رکوردهای دریافت ایمیل

از Cloudflare Dashboard وارد دامنه شوید و بخش **Email Routing** را باز کنید. در رابط جدید ممکن است مسیر آن **Compute & AI → Email Service → Email Routing** باشد.

1. گزینه **Enable Email Routing** یا **Get started** را بزنید.
2. گزینه افزودن خودکار رکوردها را تأیید کنید.
3. Cloudflare رکوردهای MX و TXT لازم را برای همان دامنه می‌سازد.
4. در بخش Routing Rules مطمئن شوید Email Routing فعال است.

می‌توانید رکوردهای موردنیاز را با CLI نیز مشاهده کنید:

```powershell
pnpm exec wrangler email routing dns get example.com
```

به‌جای `example.com` دامنه خودتان را وارد کنید.

مقادیر MX را از اینترنت یا نمونه‌های پروژه کپی نکنید؛ رکوردهای دقیق تولیدشده توسط Cloudflare برای دامنه خودتان را استفاده کنید. اگر MX متعلق به سرویس ایمیل دیگری دارید، قبل از حذف یا جایگزینی آن مطمئن شوید دیگر به آن سرویس نیاز ندارید.

### 6. ساخت Cloudflare API Token مخصوص QMail

این توکن توسط صفحه Setup برنامه برای پیدا کردن Zone، فعال‌سازی Email Routing، ساخت Catch-all Rule و در صورت انتخاب، ثبت مقصد Forward استفاده می‌شود.

1. وارد **Cloudflare Dashboard** شوید.
2. روی آیکن پروفایل بروید و **My Profile** را باز کنید.
3. وارد **API Tokens** شوید.
4. روی **Create Token** بزنید.
5. گزینه **Create Custom Token** را انتخاب کنید.
6. نامی مثل `QMail Email Routing` وارد کنید.

Permissionهای پیشنهادی:

| Scope | Permission | Level | دلیل |
|---|---|---|---|
| Zone | Zone | Read | پیدا کردن Zone ID دامنه |
| Zone | Zone Settings | Edit | فعال‌کردن Email Routing |
| Zone | Email Routing Rules | Edit | ساخت و اصلاح Catch-all و Routing Rules |
| Account | Email Routing Addresses | Edit | ساخت مقصد Forward و ارسال ایمیل تأیید مقصد |

در **Zone Resources** گزینه زیر را انتخاب کنید:

```text
Include → Specific zone → دامنه خودتان
```

در **Account Resources** فقط حسابی را انتخاب کنید که دامنه در آن قرار دارد.

موارد زیر برای توکن داخل QMail لازم نیستند:

- Workers Scripts Edit
- D1 Edit
- Account Settings Edit
- Global API Key
- DNS Edit، چون QMail رکورد DNS را مستقیماً ایجاد نمی‌کند

اگر می‌خواهید خود برنامه دامنه‌ای را که هنوز در Cloudflare وجود ندارد ایجاد کند، دسترسی گسترده‌تری برای Zone creation لازم می‌شود. روش امن‌تر این است که دامنه را دستی به Cloudflare اضافه کنید و توکن را فقط به همان Zone محدود کنید.

پس از ساخت، Token فقط یک‌بار نمایش داده می‌شود. همان لحظه آن را کپی کنید و داخل GitHub، سورس، Screenshot یا فایل `wrangler.toml` قرار ندهید.

### 7. پیدا کردن Account ID

داخل Cloudflare Dashboard دامنه را باز کنید. `Account ID` معمولاً در صفحه Overview یا بخش API در ستون کناری نمایش داده می‌شود. این مقدار Secret نیست، اما بهتر است بی‌دلیل منتشر نشود.

### 8. واردکردن اطلاعات Cloudflare در QMail

در Setup برنامه این موارد را وارد کنید:

- **Cloudflare API Token:** توکن محدود مرحله قبل
- **Account ID:** شناسه حساب Cloudflare
- **Domain:** فقط نام دامنه، مثل `example.com`؛ بدون `https://`
- **Forwarding Email:** اختیاری؛ یک ایمیل پشتیبان برای دریافت نسخه Forward شده

اگر Forwarding Email وارد کنید، Cloudflare یک ایمیل تأیید به آن آدرس می‌فرستد و باید لینک تأیید را باز کنید. مقصد تأییدنشده قابل استفاده نیست.

QMail یک Catch-all Rule می‌سازد تا تمام آدرس‌های دامنه به Worker با نام `qmail` تحویل داده شوند. اگر نام Worker را در `wrangler.toml` عوض کرده‌اید، نام پیش‌فرض داخل Setup نیز باید با آن هماهنگ شود.

برای بررسی دستی، در Cloudflare به **Email Routing → Routing Rules** بروید و مطمئن شوید Catch-all به Worker `qmail` متصل است.

## راه‌اندازی Brevo برای ارسال ایمیل

Cloudflare Email Routing در این پروژه برای دریافت ایمیل است. ارسال ایمیل‌های QMail از طریق Brevo انجام می‌شود.

### 1. ساخت حساب Brevo

1. در [Brevo](https://www.brevo.com/) حساب بسازید یا وارد شوید.
2. اطلاعات حساب و ایمیل را تأیید کنید.
3. اگر Brevo اطلاعات کسب‌وکار یا فرستنده را درخواست کرد، آن‌ها را کامل کنید.

### 2. اضافه و Authenticate کردن دامنه ارسال

1. در Brevo وارد بخش **Senders & IP → Domains** یا صفحه **Senders, Domains & Dedicated IPs** شوید.
2. گزینه **Add a domain** را بزنید.
3. دامنه‌ای را وارد کنید که قرار است ایمیل از آن ارسال شود.
4. Brevo رکوردهای DNS مخصوص همان دامنه را نمایش می‌دهد.
5. رکوردها را دقیقاً در **Cloudflare → DNS → Records** اضافه کنید.

Brevo معمولاً رکوردهای احراز دامنه مثل موارد زیر را نمایش می‌دهد، اما Name و Value دقیق را باید از پنل خود Brevo کپی کنید:

- Brevo verification code
- DKIM
- DMARC
- رکوردهای تکمیلی که Brevo برای حساب شما نمایش می‌دهد

نکات مهم رکوردها:

- رکوردهای ایمیل باید **DNS only** باشند؛ Proxy نارنجی برای رکوردهای ایمیل کاربرد ندارد.
- برای TXT مقدار داده‌شده را دقیق و بدون تغییر وارد کنید.
- اگر از قبل رکورد DMARC دارید، رکورد دوم نسازید؛ همان رکورد موجود را با سیاست مناسب ادغام کنید.
- اگر از قبل SPF دارید، دو SPF جدا برای یک Host نسازید؛ مقدارها باید در یک SPF معتبر ادغام شوند.
- رکورد DKIM را دقیقاً با Selector و Value ارائه‌شده توسط Brevo بسازید.

پس از افزودن رکوردها به Brevo برگردید و **Authenticate this email domain** یا **Verify** را بزنید. انتشار DNS ممکن است کمی زمان ببرد.

### 3. ساخت Sender

در Brevo بخش **Senders** را باز کنید و یک Sender مثل نمونه زیر بسازید:

```text
QMail <hello@example.com>
```

آدرس فرستنده باید متعلق به دامنه Authenticateشده باشد. اگر Brevo ایمیل تأیید فرستاد، آن را تأیید کنید.

### 4. ساخت Brevo API Key

1. وارد حساب Brevo شوید.
2. روی نام حساب در بالا سمت راست کلیک کنید.
3. وارد **SMTP & API** شوید.
4. تب **API Keys** را باز کنید.
5. روی **Generate a new API key** بزنید.
6. نامی مانند `QMail Production` وارد کنید.
7. Key را همان لحظه کپی و در Password Manager ذخیره کنید.

Brevo کلید را بعد از بستن پنجره دوباره به‌صورت کامل نمایش نمی‌دهد. اگر آن را گم کردید، کلید قبلی را حذف و یک کلید جدید بسازید.

برای بررسی اختیاری Key می‌توانید از API رسمی Brevo استفاده کنید، اما Key را مستقیماً داخل command history قرار ندهید. QMail هنگام Setup با endpoint حساب Brevo اعتبار Key را بررسی می‌کند.

### 5. واردکردن Brevo API Key در QMail

در مرحله Brevo از Setup برنامه، API Key را وارد کنید و ادامه دهید. سپس در Settings → Email Addresses آدرس‌های فرستنده‌ای را اضافه کنید که در Brevo معتبر هستند.

اگر ارسال خطا داد، این موارد را بررسی کنید:

- دامنه در Brevo وضعیت Authenticated داشته باشد.
- Sender در Brevo ساخته و تأیید شده باشد.
- From Address داخل QMail دقیقاً روی همان دامنه باشد.
- API Key حذف یا غیرفعال نشده باشد.
- محدودیت حساب یا اعتبار ارسال Brevo تمام نشده باشد.

## ترتیب پیشنهادی نصب Production

برای اینکه Setup بدون خطا تمام شود، این ترتیب را رعایت کنید:

1. دامنه را روی Cloudflare فعال کنید.
2. با Wrangler وارد حساب شوید.
3. D1 را بسازید و `database_id` را در `wrangler.toml` قرار دهید.
4. schema دیتابیس را اعمال کنید.
5. QMail را با نام Worker برابر `qmail` Deploy کنید.
6. Email Routing و رکوردهای Cloudflare را فعال کنید.
7. Cloudflare API Token محدود را بسازید.
8. دامنه را در Brevo Authenticate و Sender را ایجاد کنید.
9. Brevo API Key را بسازید.
10. آدرس QMail را باز و Setup داخل برنامه را کامل کنید.
11. یک ایمیل ورودی و یک ایمیل خروجی واقعی آزمایش کنید.

## تست دریافت و ارسال

### تست دریافت

از یک سرویس دیگر به آدرسی مثل `test@example.com` ایمیل بفرستید. چون Catch-all فعال است، پیام باید در Inbox ظاهر شود.

برای دیدن Log زنده Worker:

```powershell
pnpm --filter @avamail/worker tail
```

### تست ارسال

در QMail یک From Address معتبر انتخاب کنید و به ایمیلی که خودتان کنترل می‌کنید پیام بفرستید. پوشه Spam و وضعیت Transactional Logs در Brevo را هم بررسی کنید.

## خطاهای رایج

### ایمیل وارد Inbox نمی‌شود

- MXهای Cloudflare کامل نیستند یا MX قدیمی با آن‌ها تداخل دارد.
- Email Routing فعال نشده است.
- Catch-all به Worker `qmail` متصل نیست.
- نام Worker با نام داخل Routing Rule یکسان نیست.
- schema دیتابیس remote اجرا نشده است.

### خطای Cloudflare در Setup

- Token به Zone اشتباه محدود شده است.
- یکی از Permissionهای Zone Read، Zone Settings Edit، Email Routing Rules Edit یا Email Routing Addresses Edit وجود ندارد.
- Account ID متعلق به حساب دیگری است.
- دامنه هنوز در Cloudflare Active نشده است.

### خطای Brevo در Setup یا ارسال

- API Key اشتباه، حذف‌شده یا ناقص است.
- دامنه یا Sender در Brevo Authenticate نشده است.
- From Address با Sender معتبر هماهنگ نیست.
- DNS هنوز منتشر نشده یا SPF/DKIM/DMARC اشتباه است.

### خطای D1 یا `no such table`

برای محیط محلی:

```powershell
pnpm db:migrate
```

برای دیتابیس Cloudflare:

```powershell
pnpm db:migrate:prod
```

## به‌روزرسانی و Deploy مجدد

بعد از تغییر سورس:

```powershell
pnpm install
pnpm build:frontend
pnpm deploy
```

اگر schema دیتابیس تغییر کرده است، قبل از Deploy روی دیتابیس remote نیز migration را اجرا کنید.

## امنیت

- `wrangler.toml`، `.dev.vars`، `.env`، پوشه `.wrangler`، API Key و Export دیتابیس را Commit نکنید.
- از Global API Key کلودفلر استفاده نکنید؛ Custom API Token محدود بسازید.
- Cloudflare Token را فقط به حساب و Zone موردنیاز محدود کنید.
- Brevo API Key و Cloudflare Token را مثل رمز عبور نگهداری کنید و در Screenshot یا Issue منتشر نکنید.
- Credentialهای Setup در D1 ذخیره می‌شوند؛ دسترسی به Dashboard و حساب Cloudflare را با رمز قوی و 2FA محافظت کنید.
- اگر کلیدی افشا شد، فوراً آن را Revoke و کلید جدید ایجاد کنید.
- قبل از Push همیشه `git status` را بررسی کنید.

## منابع رسمی

- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/)
- [Cloudflare Email Routing API](https://developers.cloudflare.com/api/resources/email_routing/)
- [Cloudflare API Tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Brevo API key authentication](https://developers.brevo.com/docs/api-key-authentication)
- [Brevo senders and domains](https://developers.brevo.com/docs/getting-started-with-senders-and-domains)
- [Brevo domain authentication](https://developers.brevo.com/docs/domain-authentication-and-verification)

