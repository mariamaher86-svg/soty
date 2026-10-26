# صوتي — Soty

تطبيق ويب لتدريب الصوت على الغنا: دقة النغمة، المساحة والطبقة الصوتية، المقامات العربية بالربع تون، والنفس.
A small Arabic (RTL) web app for voice training: pitch accuracy, vocal range/type, Arabic maqamat with real quarter tones, breathing, and singing along with a reference track.

## التشغيل على اللابتوب / Run on the laptop

محتاجة Node.js (نسخة 20 أو أحدث).

```bash
npm install
npm run fetch-samples
npm run dev
```

`npm run fetch-samples` بينزّل أصوات البيانو والكورال **مرة واحدة بس** (حوالي ٢ ميجا) في `public/samples`، وبعد كده التطبيق بيشتغل من غير نت. لو متنزلتش، النغمات بتطلع بصوت إلكتروني بسيط.
`fetch-samples` downloads the piano and choir samples once (~2 MB) into `public/samples`; they are bundled into the build. Without them the app falls back to a synth tone.

افتحي `http://localhost:5173` في Chrome أو Edge واسمحي للميكروفون.
Open `http://localhost:5173` and allow the microphone.

أوامر تانية / Other commands:

| الأمر | بيعمل إيه |
| --- | --- |
| `npm test` | يشغّل اختبارات الوحدة (vitest) / unit tests |
| `npm run typecheck` | فحص TypeScript |
| `npm run build` | نسخة جاهزة للرفع في فولدر `dist` / production build |

## التشغيل على الموبايل / Use it on the phone

المتصفح مش بيسمح بالميكروفون غير على `https` أو `localhost`. أسهل طريقتين:
Browsers only allow the microphone on HTTPS or localhost. Two easy options:

**١. من اللابتوب على نفس الواي فاي (للتجربة):**

```bash
npm run dev:phone
```

هيطبع عنوان زي `https://192.168.1.20:5173`. افتحيه من الموبايل (لازم يكون على نفس الشبكة). المتصفح هيقول إن الشهادة مش موثوقة (لأنها شهادة تجريبية من اللابتوب) — دوسي "Advanced" وبعدين "Proceed". لو مفتحش، ممكن يكون Windows Firewall قافل البورت 5173 لـ Node.
This serves on your network over HTTPS with a self-signed certificate (`@vitejs/plugin-basic-ssl`). Accept the certificate warning on the phone once.

**٢. على GitHub Pages (للاستخدام اليومي، ومجاني):**
التطبيق شغال على **https://mariamaher86-svg.github.io/soty/** (repo: `mariamaher86-svg/soty`).
الكود بيتحفظ على GitHub (ده كمان نسخة احتياطية من الكود)، وكل `git push` بيبني التطبيق وينشره لوحده على `https://<اسمك>.github.io/soty/`.
*The code lives in a GitHub repo; every push to `main` runs `.github/workflows/deploy.yml` (npm ci → npm test → npm run build → deploy `dist` to GitHub Pages). A failing test stops the deploy. The app is served from the `/soty/` sub-path; all paths are relative, so the service worker, manifest, icons and samples work there.*

**أول مرة (خطوة بخطوة):**
1. اعملي حساب مجاني على github.com/signup.
2. اعملي repo جديد اسمه **`soty`**، ويكون **Public**، وفاضي: من غير README ولا .gitignore ولا license.
   - ليه Public؟ GitHub Pages المجاني محتاج كده. الكود هيبقى ظاهر لأي حد، لكن **بياناتك وتسجيلاتك مش في الكود** — دي على موبايلك بس.
3. في الـ repo: **Settings ← Pages ← Source: GitHub Actions**.
4. افتحي Terminal في فولدر `C:\MariaMaher\Projects\Soty` واكتبي (غيّري `<اسمك>` باسم حسابك):
   ```bash
   git add -A
   git commit -m "First version of Soty"
   git remote add origin https://github.com/<اسمك>/soty.git
   git push -u origin main
   ```
   أول `push` هيفتح نافذة في المتصفح تسجّلي فيها دخول GitHub (ده Git Credential Manager اللي جاي مع Git for Windows) — الدخول ده بتاعك إنتي.
5. افتحي تبويب **Actions** في الـ repo واستني لحد ما الـ deploy يبقى ✅ أخضر (دقيقة أو اتنين). بعدها افتحي `https://<اسمك>.github.io/soty/` من **Safari** على الآيفون ← زرار المشاركة ← **Add to Home Screen**.
6. انقلي بياناتك (تحت: "نقل بياناتك من Cloudflare لـ GitHub").

**التحديث بعد أي تعديل:**
```bash
git add -A
git commit -m "وصف التعديل"
git push
```
بعد ما الـ Actions يخلص، التطبيق على الموبايل بيقول «فيه نسخة جديدة من التطبيق — حدّثي».

*First time: create a GitHub account → create an empty **public** repo `soty` (free Pages needs a public repo; the code becomes visible, your data and recordings never leave your phone) → Settings → Pages → Source: GitHub Actions → `git add -A`, `git commit -m "First version of Soty"`, `git remote add origin https://github.com/<username>/soty.git`, `git push -u origin main` (Git Credential Manager opens a browser sign-in on the first push) → wait for the green deploy in Actions → open `https://<username>.github.io/soty/` in Safari → Add to Home Screen. Updates: `git add -A`, `git commit -m "…"`, `git push`.*

**نقل بياناتك من Cloudflare لـ GitHub / Moving your data:**
`github.io` موقع تاني غير `pages.dev`، فالتطبيق الجديد على الآيفون بيبدأ **فاضي**. انقلي البيانات مرة واحدة:
1. افتحي **التطبيق القديم** (أيقونة pages.dev على الشاشة الرئيسية) ← ⚙️ **المزيد** ← **💾 بياناتك** ← اختاري «كاملة مع ملفات الأغاني» ← «⬇️ صدّري بياناتك» (أو «📤 ابعتيه لنفسك» واحفظيه في Files).
   (لو النسخة القديمة لسه مفيهاش ⚙️ المزيد، «💾 بياناتك» هتلاقيها في آخر صفحة **التقدّم**.)
2. افتحي **التطبيق الجديد** من أيقونته (github.io) ← ⚙️ **المزيد** ← **💾 بياناتك** ← «⬆️ استرجعي بياناتك» ← اختاري الملف ← «استبدلي».
3. اتأكدي إن النتايج والأغاني والتسجيلات موجودة، **وبعدين بس** امسحي الأيقونة القديمة.

*github.io is a different origin from pages.dev, so the new home-screen app starts empty. In the old app: المزيد → بياناتك → full export. In the new app (opened from its own icon): استرجعي → استبدلي. Delete the old icon only after checking the import.*

**بديل: Cloudflare Pages (الطريقة القديمة) / Alternative:**
`npm run build` وبعدين ارفعي فولدر `dist` على Cloudflare Pages:
1. dash.cloudflare.com ← **Workers & Pages** ← **Create** ← **Pages** ← **Upload assets** ← اسحبي فولدر **`dist`** ← **Deploy** (لينك `https://<الاسم>.pages.dev`).
2. التحديث: مشروعك ← **Create new deployment** ← اسحبي `dist` تاني ← Deploy.
*Any static HTTPS host works: upload `dist/`.*

**📶 من غير إنترنت + التحديثات / Offline and updates:**
- بعد أول فتحة بإنترنت، التطبيق كله (الصفحات وأصوات البيانو والكورال) بيتحفظ على الجهاز ويشتغل من غير نت. يوتيوب ولينكات الفيديوهات بس محتاجة نت، والتطبيق بيكتب ده لما النت يقطع.
- بعد كل `git push` (أو رفع جديد على Cloudflare): **التطبيق بيعرف في الفتحة الجاية** (أو لما ترجعيله)، وبيطلع شريط «فيه نسخة جديدة من التطبيق — حدّثي». الدوسة بتحمّل النسخة الجديدة كلها مرة واحدة وتعمل refresh — مفيش خلط بين ملفات قديمة وجديدة، والنسخة القديمة بتتمسح. لو مدوستيش، بتفضلي على القديمة لحد ما تقفلي التطبيق خالص وتفتحيه.
- على الآيفون من الشاشة الرئيسية: لو الشريط مطلعش، اقفلي التطبيق من الـ app switcher وافتحيه تاني.

*PWA: `public/manifest.webmanifest` (standalone, theme colour, icons from `scripts/make-icons.mjs`) and a hand-written service worker generated at build time by a small Vite plugin in `vite.config.ts` (`src/lib/precache.ts`): it precaches every file in `dist/` (shell, hashed assets, all samples) under a versioned cache, serves cache-first, and waits (no `skipWaiting` on install) until the in-app "حدّثي" button posts `skipWaiting`, then the page reloads once — so old and new files never mix. Old `soty-*` caches are deleted on activate.*

التطبيق بيستخدم روابط بـ `#` (زي `#/path`)، فمش محتاج إعدادات `_redirects`؛ أي صفحة بتفتح عادي بعد الـ refresh. ومفيش سيرفر — كل حاجة في المتصفح.
*Hash routing, relative base (`./`): `dist/` works from any static host or sub-folder; no `_redirects` needed.*

> النتايج متخزنة في المتصفح نفسه (localStorage)، فنتايج الموبايل منفصلة عن نتايج اللابتوب.
> Results live in each browser's localStorage, so phone and laptop keep separate histories.

### على الآيفون / iPhone tips

**قبل التمرين (٣ حاجات)** — موجودين كمان كارت "📱 قبل ما تبدأي" في التمارين:
1. اقفلي الوضع الصامت (زرار Action أو Control Center) — الصامت بيكتم أصوات التطبيق (البيانو والكورال).
2. لما الميكروفون يشتغل، الآيفون ممكن يوطّي الصوت أو يطلّعه من سماعة المكالمات — علّي الصوت أو البسي سماعات.
3. في "غني مع الأغنية" ويوتيوب: EarPods بسلك (USB-C). الـ AirPods بتأخّر الصوت ومايكها بيقلل جودة التسجيل — استخدميها للسماع بس لو مفيش غيرها.

**ضيفيه للشاشة الرئيسية:**
- Safari ← زرار المشاركة ← **Add to Home Screen**، وافتحيه دايمًا من الأيقونة (Safari ممكن يمسح بيانات الموقع بعد حوالي أسبوع من غير زيارة، تطبيق الشاشة الرئيسية لأ).
- بيانات تطبيق الشاشة الرئيسية منفصلة عن Safari — انقليها بـ صدّري/استرجعي.
- صدّري نسخة احتياطية كل فترة لـ Files / iCloud Drive.

*iPhone: turn off Silent mode, raise the volume or use headphones while the mic is on, use wired EarPods for sing-along (AirPods add latency). Add to Home Screen and open from the icon; Safari may evict site data after ~7 days without a visit. Export backups to Files/iCloud Drive.*

### نقل بياناتك بين الأجهزة / Moving your data

في **⚙️ المزيد** (الترس فوق على الشمال) ← **💾 بياناتك**:
- **صدّري بياناتك** بيحفظ ملف زي `soty-backup-2026-10-20.json` فيه كل حاجة: النتايج، المساحة، مسار المبتدئ، الإعدادات، وتسجيلات المعلم (بالصوت). على الموبايل كمان فيه زرار "ابعتيه لنفسك" (واتساب/إيميل/درايف).
- **استرجعي بياناتك** على الجهاز التاني: اختاري الملف، وبعدين **استبدلي** (يمسح اللي على الجهاز ويحط اللي في الملف) أو **ادمجي** (يجمع النتايج والقياسات من الاتنين).
- الملف فيه تسجيلات صوتك، فخليه ليكي إنتي بس.

*Export/import a JSON backup (app id + format version, app localStorage keys, teacher recordings as base64 16-bit PCM). Import validates the file and asks in-page whether to replace or merge.*

## التنقل / Navigation

- تحت: ٤ أقسام — **الرئيسية** (تمرين النهارده وتحدي النهارده بس)، **التمارين** (كل التمارين متقسمة)، **أغانيّ**، **التقدّم**.
- فوق: زرار الرجوع (بيرجع خطوة لفوق، زي "→ التمارين")، و**⚙️ المزيد**: الإعدادات (بنت/ولد، الألوان، فحص الدوشة)، نسخة البيانات، الأوسمة، دليل الاستخدام، وتسجيل صوت المعلم.
- في كل تمرين: سطر واحد بيقول تعملي إيه، والزرار الأساسي تحت قريب من صباعك. الحاجات الإضافية (صوت النغمة، السرعة، عدد المرات) جوه «خيارات»، والشرح الطويل في «❓ كيفية الاستخدام».

*UI: one token set at the top of `src/styles.css` (colours light/dark, spacing `--s1…--s6`, radius, shadow, type scale, `--tap` 44px, safe-area insets) and a design-system layer at the end of the file (shell, tab bar, page header, buttons, list rows, options disclosure, feedback, toasts). System font stack (SF Arabic on iOS), 17px body. `viewport-fit=cover` + `env(safe-area-inset-*)` for the notch / home indicator. Routing rules for tabs and back: `src/lib/nav.ts` (tested).*

## التمارين / Exercises

> **👋 نكلمك إزاي؟ بنت / ولد:** بيتختار في الترحيب (أو من كارت صغير في الرئيسية، أو من ⚙️ المزيد ← الإعدادات). بيغيّر طريقة الكلام، والنغمات الافتراضية قبل اختبار المساحة (بنات ≈ F3–C5، ولاد ≈ A2–E4)، وطبقات الصوت (باص/باريتون/تينور أو كونترالتو/ميتزو/سوبرانو). لو حد بيغني بالظبط أوكتاف أوطى أو أعلى من النغمة بتظهر له ملحوظة بدل ما يفشل وخلاص.
> *Source text is written in the feminine; masculine mode converts what's on screen with one word list (`src/lib/gender.ts` + `genderDom.ts`), so buttons, help notes and messages from the logic always match. Context-dependent adjectives use `g(f, m)`. `gender.test.ts` fails if a feminine-only form survives in masculine mode.*

> **❓ الشرح جوه التطبيق:** كل صفحة فيها زرار «❓ إزاي أستخدمها» (بيفتح لوحده أول مرة بس)، وفيه صفحة **📖 دليل الاستخدام** من الرئيسية فيها كل الشرح بالترتيب و"ابدئي من هنا". نصوص الشرح كلها في `src/content/help.ts` — عدّلي فيها بسهولة؛ اختبار `help.test.ts` بيتأكد إن أسامي الزراير المكتوبة «كده» موجودة فعلاً في التطبيق.

- **🌿 الإحماء** (~٣ دقايق، أول خطوة في تمرين النهارده وكمان لوحده): ترعيش الشفايف "بررر" مع مؤشر علو الصوت، سيرينة تمشي فيها مع خط بيطلع وينزل في نص صوتك (وبيقولك قربتي قد إيه بالسنت)، وهمهمة "مممم" على ٣–٥ نغمات طالعة. بهدوء — ووقفي لو في أي وجع.
- **👂 تدريب الودن** (سماع بس): ١) التانية أعلى ولا أوطى (المسافة بتصغر لحد نص تون)، ٢) زي بعض ولا فيه فرق ١٠–٥٠ سنت، ٣) المسافات بالعربي والإنجليزي، ٤) أنهي مقام (عجم/نهاوند وبعدين راست، بياتي، حجاز، صبا). كل مستوى بيفتح بـ ٨ صح من آخر ١٠، وبعد كل إجابة تقدري تسمعي الاختيارين. النتايج في صفحة التقدم، وفيه خطوة ودن قصيرة في تمرين النهارده.
- **📚 مكتبة أغانيّ**: لكل أغنية اسم (والمغني)، لينك يوتيوب و/أو ملف صوت (بيتحفظ على الجهاز في IndexedDB، وفيه زرار يشيله)، السلم/المقام (أو "🔎 اكتشف المقام")، الكلام أو الكوردات اللي بتكتبيها إنتي (من غير ما التطبيق يجيب حاجة من النت)، ملاحظات، تصنيفات (ترانيم/طرب/أجنبي…) وصعوبة. دوسة واحدة تفتح "غني مع الأغنية" وكل حاجة جاهزة. كل نتيجة من أغنية بتتحفظ معاها: أحسن وآخر نتيجة، عدد مرات التمرين، رسم بالنتايج، و**الحتت اللي صعوبتها بتتكرر** في أكتر من مرة مع زرار "🔁 كرري الحتة دي". بحث وتصنيف وترتيب، و⭐ "أغنية الأسبوع" للقياس الأسبوعي. المكتبة بتدخل في النسخة الاحتياطية (مع ملفات الصوت أو "بدون ملفات الصوت" لنسخة صغيرة).
- **🪜 غنا الفواصل** (بالميكروفون): التطبيق يشغّل نغمة وانتي تغني المسافة المطلوبة فوقها (وبعدين تحتها): نفس النغمة/خامسة/أوكتاف، بعدين التالتات والرابعة، بعدين التانيات والسادسات، وآخر مستوى ربع تون (تانية ¾ وتالتة ¾ زي راست وبياتي). الحكم بالسنت على النغمة بالظبط (±٢٥ سنت لمدة ثانية)، وفيه زرار "💡 اسمعي الإجابة". المستويات بتفتح بـ ٨ من ١٠ زي تدريب الودن، والنتايج في التقدم وفي النسخة الاحتياطية.
- **🔁 كرري الحتة دي** (في "غني مع الأغنية"، الوضعين): من النتيجة دوسي "كرري الحتة دي" جنب أي لحظة غلط، أو "تكرار جملة" وحددي البداية والنهاية ("بداية هنا" / "نهاية هنا" أو −/+). بيكرر ٣/٥/١٠ مرات أو لحد ما توقفي، مع نتيجة لكل مرة (مثلاً 52% ← 68% ← 81%). السرعة ١٠٠٪/٨٥٪/٧٥٪ في وضع الملف من غير ما الطبقة تتغير، وفي يوتيوب السرعات اللي يوتيوب بيسمح بيها.

  *Loop timing uses the track's own clock (audio `currentTime` / YouTube `getCurrentTime`), so at slower speeds the reference curve lines up by itself; only the fixed mic delay is converted to media time (`latency × rate`). `preservesPitch` + `webkitPreservesPitch` keep the pitch in Safari/Chrome.*
- **🏋️ التمارين** (صفحة واحدة متقسمة): الإحماء، النفس، الطبقات والمساحة، العالي والواطي، النغمة (ولعبة الصوت)، الودن، الإيقاع، الفواصل، المقامات، الأغاني (والكورال).
- **🔇 دوشة المكان** (اختياري، قبل تمارين المايك): فحص ٣ ثواني سكوت. لو المكان دوشة: «المكان دوشة شوية — النتايج ممكن تطلع غلط» و«كمّلي برضه». المستوى المتقاس بيعلّي حد "الصوت اللي يتحسب" عشان الدوشة متتحسبش غنا. بيتقفل بـ «متفحصيش تاني» ويرجع من 💾 بياناتك.
- **🎼 صوتك في الكورال** (من صفحة الأغنية): ملف لكل صوت (سوبرانو/ألتو/تينور/باص…) متخزن زي ملف الأغنية وداخل في النسخة الاحتياطية. بيشتغلوا مع بعض متزامنين، ولكل صوت علو وكتم. أوضاع: «اسمعي صوتك لوحده»، «صوتك عالي»، «الكورال من غيرك»، و«صوتك بيختفي تدريجيًا» (ربع أوطى مع كل تكرار). النتيجة على لحن صوتك إنتي (حتى لو أوكتاف أوطى/أعلى)، مع تقسيم الجمل والتكرار وسرعة ٧٥٪.
- **🥁 الإيقاع**: مترونوم (سرعة، ٢/٣/٤ في المازورة، الأولى أعلى)، وتمرين تصقيف أو «تا»: ٤ عدّات «١، ٢، ٣، ٤ — ادخلي» وبعدين مازورتين من ♩ ♫ 𝄽. التطبيق بيسمع كل تصقيفة (ارتفاع مفاجئ في العلو) ويقول «دخلتي بدري ٠٫١ ثانية» أو «متأخر» أو «مظبوط»، ونتيجة كلية. **ظبط التأخير**: تصقيف مع ١٢ ضربة مرة واحدة، والتأخير (الموبايل بيتأخر في السماع والتسجيل) بيتحفظ ويتطرح؛ تقدري تعيديه. فيه درس «الإيقاع» في الأساسيات، وخطوة إيقاع في مسار المبتدئ بعد ما الأساسيات تخلص (يوم إيقاع ويوم فواصل).
- **📤 ابعتي أغنية**: «📤 صدّري الأغنية» في صفحة الأغنية = ملف واحد فيه البيانات، السلم، الكلام والكوردات، الجمل، والصوت وأصوات الكورال (من غير نتايجك)، مع الحجم واختيار "من غير صوت"، وزرار مشاركة على الموبايل. «📥 استوردي أغنية» في المكتبة بيفحص الملف؛ لو الأغنية موجودة بيسأل: «احتفظي بالاتنين» أو «استبدلي القديمة».
- **🎹 البيانو**: البيانو كله (C2–C7)، دوسة على أي مفتاح وغنّيه والمؤشر بيقول قريب ولا بعيد، أو «🎙️ وريني بغني إيه». و**🎶 فوكاليز على البيانو**: التمرين بيتعزف والمفاتيح بتنوّر، وبعدين «🎤 دورك» وكل نغمة بتاخد ✔ أو ✘ بالسنت، مع «⬆ نص تون» / «⬇ نص تون» والطلوع لوحده، وكمان سلم أي مقام بالربع تون.
- **🎮 لعبة الصوت**: عصفورة على canvas ارتفاعها = النغمة (على قد مساحتك)، وبوابات جاية من اليمين. ٣ مستويات: نغمات لوحدها ببطء ← دو ري مي ← جمل مقامات بالربع تون. السكوت = العصفورة تنزل بالراحة (مفيش موت). وقفي/كمّلي، أعلى نتيجة لكل مستوى، وبتحترم "تقليل الحركة".
- **🏆 الأوسمة والتحدي**: تحدي يومي على قد المستوى بيتعلّم لوحده من النتايج، وأوسمة محسوبة من البيانات المتخزنة بس (٧ أيام ورا بعض، أول أوكتاف، كل الأساسيات، مقام ٩٠٪، أول أغنية جملة جملة، إيقاع ٩٠٪…). احتفال صغير لما وسام جديد ييجي. داخلين في النسخة الاحتياطية.
- **🎚️ العالي والواطي**: من واطي لعالي، من عالي لواطي، ومسا دي فوتشي على نغمة واحدة؛ خطين (العلو والنغمة) ونتيجتين: نعومة العلو وثبات النغمة، وتنبيه هادي لو الصوت علي جامد على نغمة عالية.
- **🪜 إزاي أجيب دو صح؟**: سلم نغمات ونقطة لصوت المستخدم وأسهم ⬆/⬇ — اسمع، همهم، زحلق لحد الخط، اثبت ثانية (دو→صول ورجوع). بيدخل في تمرين النهارده في الأسبوع الأول.
- **🎶 تمارين الصوت (فوكاليز)**: سلم ٥ نغمات "آه"، أربيجيو "ما مي ما"، ستاكاتو "ها ها"، "ني ني ني"، وزحلقة أوكتاف "وو" — بتطلع نص تون كل مرة في المساحة المريحة وبعدين تنزل.
- **🚗 وضع العربية**: جلسة ١٠–٢٠ دقيقة بالصوت بس (كلام عربي بـ speechSynthesis لو موجود، وإلا صفارات + نص)، Wake Lock للشاشة. على الآيفون قفل الشاشة غالبًا بيوقّف الصوت.
- **🎓 تعلّم الأغنية جملة جملة** (من صفحة الأغنية لو ليها ملف): تقسيم بالسكتات، نغمات كل جملة (بالربع تون) على البيانو ببطء، تكرار بنتيجة لحد ٧٠٪، وبعدين جملتين والأغنية كلها.
- **🎙️ تسجيل صوت المعلم** بقى بيفحص كل تسجيل (ثابت وفي حدود ±٣٠ سنت) قبل الحفظ، وفيه وضع **دو ري مي** لصوت بيقول اسم النغمة ("🗣️ صوت بيقول النغمة" في اختيار الصوت).
- **❓ كيفية الاستخدام**: زرار في كل صفحة بيفتح الشرح في نافذة.
- **🎓 أساسيات الموسيقى**: ١٠ دروس صغيرة (النغمة، دو ري مي، الأوكتاف، التون ونص التون، السلم، الربع تون، المقام، السنت، إزاي مبقاش نشاز، الإيقاع)، كل درس بأمثلة مسموعة واختبار ٥ أسئلة (النجاح ٤ من ٥). مسار المبتدئ بيحط درس كل يوم كأول خطوة لحد ما يخلصوا. النصوص في `src/content/lessons.ts`.
- **🌱 مسار المبتدئ (ابدئي من هنا)** — أول كارت في الصفحة الرئيسية، وعليه عدد الأيام ورا بعض والخطوة الجاية.
  - **الخطوات لازم تتعمل بجد**: زرار «التالي ←» بيشتغل بس لما الخطوة يبقى ليها نتيجة حقيقية، وفيه «تخطي الخطوة» منفصل مابيحفظش حاجة. التمرين بيتحسب في 🔥 لما نص الخطوات على الأقل تتعمل، والقياس الفاضي مش بيتحفظ (والقديم الفاضي بيتجاهل من غير ما يتمسح). فيه «🔁 إعادة قياس البداية».
  - **قياس البداية** مرة واحدة: المساحة، مطابقة النغمة (النشاز بالسنت ووقت مسك النغمة)، طول النفس، الثبات، والسسسس.
  - **تمرين النهارده** (~١٣ دقيقة): إحماء ← سسسس ← مطابقة نغمة ← نغمة ممدودة ← مقام على مهلك ← ودن ← فواصل. في الأيام الخفيفة (بعد "شوية") ~٦ دقايق، وبعد "أيوه" بننصحك تسيبي التمرين وتريّحي. النغمات دايمًا من نص صوتك. المقام بيتغير كل يوم: الأول عجم ونهاوند، وبعدين راست، بياتي، حجاز.
  - **القياس الأسبوعي** بعد ٧ أيام: نفس القياس، ومقارنة بالبداية وبالأسبوع اللي فات بكلام بسيط ("النفس زاد من 8 لـ 14 ثانية 👏")، وتذكير تسجّلي نفس الأغنية كل أسبوع (فيه زرار "احفظي التسجيل على جهازك").
  - بعد كل تمرين سؤال: "حسّيتي بأي وجع أو تعب في الزور؟" — "أيوه" = وقفي وريّحي صوتك وروحي لدكتور لو البحة كملت أكتر من يومين؛ "شوية" = تمرين أخف بكرة.
  - صفحة التقدم فيها خط لكل قياس أسبوعي مقارنة بالبداية.

- **اختبار المساحة الصوتية** — غني أوطى نغمة ثابتة وبعدين أعلى نغمة؛ التطبيق يقول المساحة (مثلاً `A3–E5`) والطبقة المتوقعة، ويحفظها. باقي التمارين بتختار نغماتها من المساحة دي.
- **مطابقة النغمة** — نغمة في مساحتك، والمؤشر يوريكي الانحراف بالسنت ("+15 سنت — انزلي شوية"). النجاح = ثابتة في حدود ±20 سنت لمدة ثانية.
- **المقامات** — راست، بياتي، حجاز، نهاوند، عجم، صبا، كرد، صعود ونزول، والقرار مختار على قد صوتك (وتقدري تغيريه). كل درجة بتتحكم عليها بالسنت على الربع تون الحقيقي (مثلاً تالتة الراست نص بيمول = 350 سنت).
- **النفس** — طول النفس (أطول نغمة)، ثبات الصوت (الاهتزاز بالسنت في ٥ ثواني)، وتمرين سسسس (شهيق ٤ / كتم ٤ / سسسس، والطول بيتقاس من علو الصوت).
- **غني مع الأغنية** — حمّلي ملف صوت المغني لوحده أو صوت مدرّستك؛ التطبيق يطلع خط النغمات، وتغني معاه (أو مع ملف موسيقى منفصل) بالسماعات. بعدها رسم بيقارن خطك بخط المرجع (من غير ما يفرق الأوكتاف)، النتيجة، الأماكن اللي محتاجة تمرين، وتقدري تسمعي تسجيلك.
- **غني مع يوتيوب (جوه السلم)** — في صفحة "غني مع الأغنية" اختاري "يوتيوب"، حطي لينك الفيديو (`watch?v=` أو `youtu.be/` أو `shorts/` أو `music.youtube.com`) واختاري سلم الأغنية (القرار + ماجير/مينور أو أي مقام). وانتي بتغني مع الفيديو التطبيق بيعلّم اللحظات اللي غنيتي فيها نغمة برا السلم، وفي الآخر رسم بالوقت ونسبة "جوه السلم" وتسجيلك.

  **تنبيهات وضع يوتيوب:**
  - 🎧 البسي سماعات؛ من غيرها الميكروفون هيسمع الأغنية وقراءة صوتك هتبوظ.
  - التطبيق مش بيقدر يسمع صوت اليوتيوب نفسه (المتصفح مش بيدّيه الصوت)، فبيشوف بس إنك جوه سلم الأغنية — **مش** بيقارنك بلحن المغني نغمة بنغمة.
  - للمقارنة نغمة بنغمة: استخدمي ملف صوت بتاعك (مثلاً MP3 اشتريتيه) في وضع "ملف صوت"، ولو عايزة افصلي صوت المغني الأول في VocalPitchTrainer.
  - تنزيل الصوت من يوتيوب ضد شروط يوتيوب، فالتطبيق مش بيعمل كده (بيستخدم مشغّل يوتيوب الرسمي جوه الصفحة بس).
  - الوضع ده محتاج إنترنت، عكس باقي التطبيق.

  *YouTube mode: the video plays through the official IFrame Player API (embed only, nothing is downloaded). The browser does not expose the video's audio, so the app only checks whether you stay in the chosen scale/maqam (nearest degree, octave-insensitive, ±40 cents, short blips ignored); it does not compare you with the singer's melody. Use headphones. Needs internet.*
- **اكتشف المقام** — صفحة لوحدها، وكمان زرار جنب اختيار السلم في وضع يوتيوب. شغّلي الأغنية من سماعة (من غير سماعات ودن) أو غنّيها ٢٠–٤٠ ثانية؛ التطبيق يعمل هيستوجرام للنغمات (٢٤ خانة في الأوكتاف، يعني الربع تون محسوب) ويقارنه بكل قرار (٢٤) × كل سلم (ماجير، مينور، وكل مقام في الجدول)، ويطلع أقرب ٢–٣ اختيارات بنسبة ثقة. اختياري: "النغمة اللي الأغنية بتخلص عليها" — بتدّي وزن كبير للقرار. كل نتيجة ليها زرار تسمعي السلم على البيانو وزرار "استخدمه" بيحطه في وضع يوتيوب.

  **تنبيهات:** بيشتغل كويس مع الماجير والمينور؛ مع المقامات العربي ده تقدير، خصوصًا بين المقامات القريبة (بياتي/كرد، راست/عجم) فاتأكدي بودنك؛ التسجيل ممكن يكون متعلّى أو متوطّى عن ورقة الكوردات؛ سماعة وأوضة هادية بيدّوا نتيجة أحسن.

  *Key/maqam detection: octave-folded 24-bin pitch-class histogram (duration × clarity weighted, silence and slides skipped) scored by cosine similarity against templates for every tonic × scale, with extra weight on tonic and 5th, plus an optional end-note tonic hint. Reliable for major/minor; an estimate for close maqamat.*
- **التقدم** — أحسن نتيجة في كل يوم لكل تمرين.
- **سجّل صوت المعلم** — حد يسجل نغمات ثابتة (حوالي ٣ في كل منطقة صوت)؛ التطبيق يعرف نغمة كل تسجيل ويقصّه على الجزء الثابت ويحفظه في المتصفح (IndexedDB). تقدري تسجلي تاني أو تمسحي أي نغمة.
- **صوت النغمة** — في التمارين تختاري 🎹 بيانو أو 🗣️ صوت (صوت المعلم لو متسجل، غير كده كورال). النغمات اللي بين التسجيلات بتتعمل بتغيير سرعة أقرب تسجيل، فالربع تون بيطلع بالسنت بالظبط.

## الأصوات والتراخيص / Sound credits

- Piano: **Salamander Grand Piano V3** by Alexander Holm — [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/). Files via the [Tone.js audio](https://github.com/Tonejs/audio) repository.
- Choir "Aah": **FluidR3_GM** soundfont by Frank Wen — [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/us/). Rendered per note by [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts).

## للمطوّرة / For developers

- `src/lib/` — pure logic, unit-tested: `music.ts` (Hz ↔ note ↔ cents), `maqam.ts` (**the maqam table — add a row to add a maqam**), `voice.ts` (voice types), `stats.ts` (stability, hold detection, timers), `compare.ts` (octave-insensitive curve comparison), `pitchTrack.ts` (pitch curve from audio with `pitchy`), `storage.ts`, `progress.ts`.
- `src/audio/` — Web Audio: `sound.ts` is the one `playNote()` for every reference note (piano / choir / teacher samples, pitch-shifted from the nearest sample; synth fallback), `teacherStore.ts` (IndexedDB), microphone + live pitch (`pitchy`, McLeod method).
- `src/lib/songs.ts` — song validation, stats, recurring hard moments, search/sort, merge by id (tested); `src/pages/LibraryPage.tsx` — list / song page / editor; `src/audio/songFiles.ts` + `src/audio/db.ts` — song audio in IndexedDB (DB version 2).
- `src/lib/loop.ts` — loop window, speed/latency math, per-repeat score (tested); `src/components/LoopPractice.tsx` — loop UI for both modes; `src/lib/intervalSing.ts` + `src/pages/IntervalPage.tsx` — interval singing (tested).
- `src/lib/ear.ts` — ear-training levels, unlock rule (8/10), question generators (tested); `src/lib/warmup.ts` — siren curve and follow score (tested); pages `EarPage.tsx`, `WarmupPage.tsx`.
- `src/lib/backup.ts` — backup build / validate / replace-merge plan / audio base64 (tested); `src/components/BackupSection.tsx` — its UI on the progress page.
- `src/lib/path.ts` — beginner path rules: today's maqam, weekly due date, streak, middle-of-range notes, comparison messages (tested); `src/pages/PathPage.tsx` runs the existing exercises embedded, step by step.
- `src/lib/keyDetect.ts` — key/maqam detection (tested); `src/components/KeyDetector.tsx` — its screen.
- `src/lib/scale.ts` — scale/maqam membership for YouTube mode (tested); `src/lib/youtube.ts` — link parsing (tested); `src/audio/youtubePlayer.ts` — IFrame API loader.
- `src/lib/samples.ts` — pitch-shift ratio, nearest-sample choice, steady-part detection and trimming (tested).
- `src/lib/precache.ts` — precache list, cache version, generated service worker (tested); `src/audio/offline.ts` — registration + update prompt.
- `src/lib/noise.ts` — room-noise level and the voice threshold it sets (tested); `src/components/NoiseCheck.tsx`.
- `src/lib/choir.ts` — choir modes/gains, sync, part keys, part octave (tested); `src/pages/ChoirPage.tsx` — parts panel + synced player (one `<audio>` + GainNode per part).
- `src/lib/rhythm.ts` — metronome lookahead scheduling, onset detection, latency calibration, timing score (tested); `src/audio/metronome.ts`; `src/pages/RhythmPage.tsx`.
- `src/lib/songShare.ts` — one-song package build/validate/import plan (tested); `src/components/SongShare.tsx`.
- `src/lib/keyboard.ts` — piano layout, names, quarter-tone keys, nearest key (tested); `src/components/PianoKeyboard.tsx`; `src/pages/PianoPage.tsx`. `src/lib/pianoVocalise.ts` — vocalise/maqam steps, note-by-note follow (hold ✔ / timeout ✘), round score, auto-climb (tested); `src/components/PianoVocalise.tsx`.
- `src/lib/game.ts` — pitch → height, bird glide, gates and scoring, courses (tested); `src/pages/GamePage.tsx` — canvas + one requestAnimationFrame loop with preallocated state (mic read directly, no React re-render per frame).
- `src/lib/badges.ts` — badge rules and the daily challenge (tested); `src/pages/BadgesPage.tsx` — page + app-wide celebration (listens to the `soty-result` event from `addResult`).
- `src/lib/dynamics.ts` — crescendo/decrescendo/messa di voce scoring and the loud-high warning (tested); `src/pages/DynamicsPage.tsx`.
- `src/pages/` — one file per exercise; the list of pages is at the top of `src/App.tsx`.
- Future: reference melodies exported from the VocalPitchTrainer project could be loaded directly instead of analysing an audio file.
