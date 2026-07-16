const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Truncating stale cost configuration data...');
  await prisma.aICreditCost.deleteMany({});

  const creditCosts = [
    { action: 'POST_GENERATION',              cost: 5,  description: 'Credits per standard AI social post generation' },
    { action: 'VIDEO_GENERATION',             cost: 20, description: 'Credits per premium AI video creation' },
    { action: 'GRAPHICS_GENERATION',          cost: 10, description: 'Credits per DALL-E graphics template generation' },
    { action: 'MESSAGE_AI_REPLY',             cost: 1,  description: 'Credits per Inbox AI message auto-reply' },
    { action: 'AI_COMMENTS_REPLY',            cost: 1,  description: 'Credits per social media comment auto-reply' },
    { action: 'TEMPLATE_BLOG_POST',           cost: 5,  description: 'Credits for Blog Post popular template' },
    { action: 'TEMPLATE_AD_COPY',             cost: 4,  description: 'Credits for Ad Copy popular template' },
    { action: 'TEMPLATE_SOCIAL_MEDIA_POST',   cost: 2,  description: 'Credits for Social Media Post popular template' },
    { action: 'TEMPLATE_EMAIL',               cost: 3,  description: 'Credits for Email popular template' },
    { action: 'TEMPLATE_PRODUCT_DESCRIPTION', cost: 3,  description: 'Credits for Product Description popular template' },
    { action: 'TEMPLATE_VIDEO_SCRIPT',        cost: 5,  description: 'Credits for Video Script popular template' },
    { action: 'TOOL_BLOG_WRITER',             cost: 5,  description: 'Credits for Blog Writer tool' },
    { action: 'TOOL_AD_COPY_GENERATOR',       cost: 4,  description: 'Credits for Ad Copy Generator tool' },
    { action: 'TOOL_EMAIL_GENERATOR',         cost: 3,  description: 'Credits for Email Generator tool' },
    { action: 'TOOL_CONTENT_REWRITER',        cost: 2,  description: 'Credits for Content Rewriter tool' },
    { action: 'TOOL_PARAGRAPH_EXPANDER',      cost: 2,  description: 'Credits for Paragraph Expander tool' },
    { action: 'SEO_AUDIT',                    cost: 8,  description: 'Credits per AI-powered SEO audit run' },
    { action: 'WEBSITE_POST_GENERATION',       cost: 20, description: 'Credits per dynamic AI SEO blog post generation' },
  ];

  for (const item of creditCosts) {
    await prisma.aICreditCost.create({ data: item });
  }
  console.log('Credit Costs Seeded!');

  console.log('Seeding High-Quality Global Templates...');
  await prisma.globalTemplate.deleteMany({});

  const T = (name, slug, title, description, category, icon, prompt, variables) => ({
    name, slug, title, description, category, icon, prompt, variables, isActive: true
  });

  const templates = [
    T(
      'Blog Post', 'blog-post', 'Blog Post',
      'Create SEO-optimized, long-form blog posts that rank and convert',
      'Popular Templates', 'FileText',
      `You are an expert content strategist and SEO copywriter. Write a high-quality, long-form blog post.

TOPIC: {topic}
TARGET KEYWORDS: {keywords}
TARGET AUDIENCE: {audience}
WORD COUNT: {wordCount} words
TONE: {tone}

REQUIREMENTS:
- Magnetic, curiosity-driven H1 headline with primary keyword
- Compelling hook addressing the reader pain point
- Clear H2 and H3 subheadings for logical structure
- Key Takeaways / TL;DR section at the top
- Authoritative yet conversational voice
- Natural keyword usage without stuffing
- Data-driven insight or statistic every 200-300 words
- One actionable Pro Tip callout
- Strong CTA at the end
- Output in clean Markdown

Write the full blog post now:`,
      [
        { name: 'topic',     label: 'Blog Topic',          placeholder: 'e.g. 10 proven ways to grow your Instagram following in 2025', type: 'textarea', required: true },
        { name: 'keywords',  label: 'Target SEO Keywords', placeholder: 'e.g. Instagram growth, social media tips, increase followers', type: 'text', required: false },
        { name: 'audience',  label: 'Target Audience',     placeholder: 'e.g. Small business owners, freelance marketers', type: 'text', required: true },
        { name: 'wordCount', label: 'Desired Word Count',  placeholder: 'e.g. 1200', type: 'text', required: false },
        { name: 'tone',      label: 'Tone of Voice',       placeholder: 'e.g. Friendly, Professional, Bold', type: 'text', required: true },
      ]
    ),
    T(
      'Ad Copy', 'ad-copy', 'Ad Copy',
      'Write high-converting ad copy that stops the scroll and drives clicks',
      'Popular Templates', 'Megaphone',
      `You are a world-class direct-response copywriter. Write 3 powerful ad copy variations.

PRODUCT / SERVICE: {productName}
KEY BENEFITS: {benefits}
TARGET AUDIENCE: {audience}
PLATFORM: {platform}
OFFER / HOOK: {offer}
TONE: {tone}

For each variation use a different framework: PAS, BAB, or FOMO. Include:
- Hook: first 5 words must stop a scrolling thumb
- Body with social proof cue (e.g. "Join 5,000+ brands...")
- One clear specific CTA

OUTPUT FORMAT:
**Variation 1 - [Framework]**
Headline: ...
Body: ...
CTA: ...

(repeat for all 3)

Write all 3 now:`,
      [
        { name: 'productName', label: 'Product / Service Name', placeholder: 'e.g. Growthly - AI-powered social media scheduler', type: 'text', required: true },
        { name: 'benefits',    label: 'Top 3 Benefits',         placeholder: 'e.g. Save 10 hrs/week, auto-post to 6 platforms, AI captions', type: 'textarea', required: true },
        { name: 'audience',    label: 'Target Audience',        placeholder: 'e.g. Busy solopreneurs and agency owners', type: 'text', required: true },
        { name: 'platform',    label: 'Ad Platform',            placeholder: 'e.g. Facebook, Instagram Stories, Google Ads, LinkedIn', type: 'text', required: true },
        { name: 'offer',       label: 'Offer / Hook',           placeholder: 'e.g. 14-day free trial, no credit card required', type: 'text', required: false },
        { name: 'tone',        label: 'Tone of Voice',          placeholder: 'e.g. Energetic, Conversational, Professional', type: 'text', required: true },
      ]
    ),
    T(
      'Social Media Post', 'social-media-post', 'Social Media Post',
      'Craft scroll-stopping captions for every social platform',
      'Popular Templates', 'ThumbsUp',
      `You are an expert social media content creator who writes viral, high-engagement captions. Create 3 unique post variations.

TOPIC / GOAL: {topic}
KEY MESSAGE: {message}
PLATFORM: {platform}
HASHTAG STYLE: {hashtagStyle}
TONE: {tone}

Instructions:
- Variation 1: Question hook
- Variation 2: Bold statement hook
- Variation 3: Story opener (ultra-short, 2-3 lines for Reels/Shorts)
- Write natively for the platform
- Include 3-5 relevant high-reach hashtags per post
- End each with an engagement CTA

OUTPUT FORMAT:
**Post 1 - Question Hook**
[Caption + Hashtags]

**Post 2 - Bold Statement**
...

**Post 3 - Short Hook Version**
...`,
      [
        { name: 'topic',        label: 'Post Topic / Announcement',    placeholder: 'e.g. We just launched our new analytics dashboard', type: 'textarea', required: true },
        { name: 'message',      label: 'Core Message to Communicate',  placeholder: 'e.g. Users can now see real-time engagement data in one view', type: 'text', required: true },
        { name: 'platform',     label: 'Target Platform',              placeholder: 'e.g. LinkedIn, Instagram, X (Twitter), Facebook', type: 'text', required: true },
        { name: 'hashtagStyle', label: 'Hashtag Style',                placeholder: 'e.g. Niche-specific, Trending broad, Mixed', type: 'text', required: false },
        { name: 'tone',         label: 'Tone of Voice',                placeholder: 'e.g. Excited, Professional, Casual, Witty', type: 'text', required: true },
      ]
    ),
    T(
      'Email', 'email-generator', 'Email',
      'Write professional, persuasive emails that get opened, read, and replied to',
      'Popular Templates', 'Mail',
      `You are an expert business communication writer. Write a professional, high-impact email.

EMAIL PURPOSE: {purpose}
SENDER NAME AND ROLE: {senderName}
RECIPIENT CONTEXT: {recipientContext}
KEY POINTS TO COVER: {details}
DESIRED OUTCOME: {outcome}
TONE: {tone}

Requirements:
- Compelling subject line (avoid spam triggers) + preview text (80 chars)
- Opening line: NO "I hope this email finds you well" - pattern interrupt instead
- Short paragraphs (2-3 lines) for mobile readability
- Bold the key insight
- Single clear low-friction CTA
- Confident professional sign-off
- Optional P.S. line for urgency

OUTPUT:
Subject: [Subject Line]
Preview: [Preview text]

[Email Body]

[Sign-off]`,
      [
        { name: 'purpose',          label: 'Email Purpose / Type',    placeholder: 'e.g. Cold outreach, Follow-up, Partnership proposal, Welcome', type: 'text', required: true },
        { name: 'senderName',       label: 'Your Name and Role',      placeholder: 'e.g. Nabin Sharma, Founder at Growthly', type: 'text', required: true },
        { name: 'recipientContext', label: 'Who Are You Writing To?', placeholder: 'e.g. Marketing director at a D2C brand', type: 'text', required: true },
        { name: 'details',          label: 'Key Points to Cover',     placeholder: 'e.g. Introducing new feature, requesting 15-min demo call', type: 'textarea', required: true },
        { name: 'outcome',          label: 'Desired Outcome / CTA',   placeholder: 'e.g. Book a call, Try the free trial, Reply with feedback', type: 'text', required: true },
        { name: 'tone',             label: 'Tone of Voice',           placeholder: 'e.g. Professional, Warm, Confident, Friendly', type: 'text', required: true },
      ]
    ),
    T(
      'Product Description', 'product-description', 'Product Description',
      'Write benefit-driven product descriptions that increase conversions',
      'Popular Templates', 'ShoppingBag',
      `You are an expert eCommerce copywriter. Write a compelling, benefit-first product description.

PRODUCT NAME: {productName}
PRODUCT CATEGORY: {category}
KEY FEATURES AND SPECS: {features}
UNIQUE SELLING POINT (USP): {usp}
TARGET BUYER: {buyer}
TONE: {tone}

Requirements:
- Emotionally resonant tagline (punchy, max 10 words)
- Lead with BENEFITS not features
- 5-7 key features as bullets with benefit-focused copy
- "Who Its Perfect For" section
- Confidence-driven closing CTA
- No cliches: no "high-quality", "game-changer", "revolutionary"

OUTPUT FORMAT:
**[Product Tagline]**

[Opening description - 3-4 lines]

**What Youll Love:**
- [Feature: Benefit]
...

**Perfect For:** [buyer match]

[Closing CTA]`,
      [
        { name: 'productName', label: 'Product Name',           placeholder: 'e.g. AirFlow Pro Ergonomic Office Chair', type: 'text', required: true },
        { name: 'category',    label: 'Product Category',       placeholder: 'e.g. Office Furniture, Skincare, Tech Gadgets', type: 'text', required: true },
        { name: 'features',    label: 'Key Features and Specs', placeholder: 'e.g. Mesh back, adjustable lumbar, 4D armrests, 5-year warranty', type: 'textarea', required: true },
        { name: 'usp',         label: 'What Makes It Unique?',  placeholder: 'e.g. Only chair with NASA-derived pressure mapping', type: 'text', required: true },
        { name: 'buyer',       label: 'Target Buyer',           placeholder: 'e.g. Remote workers who sit 8+ hrs a day', type: 'text', required: true },
        { name: 'tone',        label: 'Tone of Voice',          placeholder: 'e.g. Premium, Friendly, Technical, Minimalist', type: 'text', required: true },
      ]
    ),
    T(
      'Video Script', 'video-script', 'Video Script',
      'Write attention-grabbing video scripts for YouTube, Reels, TikTok and Ads',
      'Popular Templates', 'Play',
      `You are a professional video scriptwriter. Write a complete, production-ready script.

VIDEO TOPIC: {topic}
VIDEO FORMAT: {format}
TARGET DURATION: {duration}
PLATFORM: {platform}
TARGET AUDIENCE: {audience}
TONE / STYLE: {tone}

SCRIPT STRUCTURE:
- HOOK (0-3 sec): First line must be impossible to scroll past
- INTRO (3-15 sec): Promise what the viewer gains by watching to the end
- BODY: Numbered points with [B-ROLL], [ON-SCREEN TEXT], [VISUAL CUE] notes
- MIDPOINT RETENTION HOOK: Re-engage with a teaser or twist
- OUTRO / CTA (last 10 sec): Single clear action
- Add [PAUSE] and [EMPHASIS] delivery notes

FORMAT each section:
[SECTION NAME]
VO: "..."
[VISUAL DIRECTION]

Write the complete script now:`,
      [
        { name: 'topic',    label: 'Video Topic / Core Idea', placeholder: 'e.g. 5 social media mistakes killing your brand reach', type: 'textarea', required: true },
        { name: 'format',   label: 'Video Format',            placeholder: 'e.g. Tutorial, Listicle, Talking Head, Product Demo', type: 'text', required: true },
        { name: 'duration', label: 'Target Duration',         placeholder: 'e.g. 60 seconds, 3 minutes, 10 minutes', type: 'text', required: true },
        { name: 'platform', label: 'Publishing Platform',     placeholder: 'e.g. YouTube, Instagram Reels, TikTok, Facebook', type: 'text', required: true },
        { name: 'audience', label: 'Target Audience',         placeholder: 'e.g. Young entrepreneurs aged 22-35', type: 'text', required: true },
        { name: 'tone',     label: 'Tone / Delivery Style',   placeholder: 'e.g. High-energy, Calm educational, Funny, Inspirational', type: 'text', required: true },
      ]
    ),
    T(
      'Blog Writer', 'blog-writer', 'Blog Writer',
      'Write SEO-optimized, expert blog posts that rank on Google',
      'Writing Tools', 'BookOpen',
      `You are a senior SEO content writer. Write a comprehensive, authoritative blog post.

TOPIC: {topic}
TARGET KEYWORDS: {keywords}
TARGET AUDIENCE: {audience}
WORD COUNT: {wordCount}
TONE: {tone}

WRITING GUIDELINES (E-E-A-T principles):
- Open with a data-backed stat or surprising fact
- Keyword-rich H2/H3 headings matching real search intent
- Internal linking suggestions marked as [LINK: topic]
- FAQ section at the end targeting "People Also Ask"
- Short paragraphs (2-3 sentences), bolded key terms, numbered lists
- Every section delivers genuine value - no filler
- Forward-looking conclusion with single CTA

Write the complete publication-ready blog post:`,
      [
        { name: 'topic',     label: 'Blog Topic',           placeholder: 'e.g. Ultimate guide to email marketing automation for SaaS', type: 'textarea', required: true },
        { name: 'keywords',  label: 'Primary SEO Keywords', placeholder: 'e.g. email marketing automation, SaaS email campaigns', type: 'text', required: false },
        { name: 'audience',  label: 'Target Reader',        placeholder: 'e.g. SaaS founders, B2B marketers', type: 'text', required: true },
        { name: 'wordCount', label: 'Word Count Target',    placeholder: 'e.g. 1500', type: 'text', required: false },
        { name: 'tone',      label: 'Tone of Voice',        placeholder: 'e.g. Authoritative, Friendly, Expert', type: 'text', required: true },
      ]
    ),
    T(
      'Ad Copy Generator', 'ad-copy-generator', 'Ad Copy Generator',
      'Generate tested, high-ROAS ad copy using proven copywriting formulas',
      'Writing Tools', 'BadgePercent',
      `You are a performance marketing copywriter. Generate multiple ad copy variants using proven frameworks.

PRODUCT / SERVICE: {productName}
CORE VALUE PROPOSITION: {valueProposition}
BIGGEST PAIN POINT SOLVED: {painPoint}
TARGET CUSTOMER: {audience}
PLATFORM: {platform}
TONE: {tone}

Write 4 complete ad variants using these frameworks:
1. PAS (Problem-Agitate-Solution)
2. FOMO + Social Proof
3. Before and After Bridge
4. Question Hook

For each: Headline + Body (max 125 words) + CTA button text

BONUS: 5 headline-only A/B test variations at the end.

Write all copy now:`,
      [
        { name: 'productName',      label: 'Product / Service Name',    placeholder: 'e.g. Growthly Pro Plan', type: 'text', required: true },
        { name: 'valueProposition', label: 'Core Value Proposition',    placeholder: 'e.g. Schedule a month of posts in 30 minutes with AI', type: 'text', required: true },
        { name: 'painPoint',        label: 'Biggest Pain Point Solved', placeholder: 'e.g. Spending hours writing captions that get no engagement', type: 'text', required: true },
        { name: 'audience',         label: 'Target Customer Profile',   placeholder: 'e.g. Marketing managers at D2C brands', type: 'text', required: true },
        { name: 'platform',         label: 'Ad Platform',               placeholder: 'e.g. Meta Ads, Google Search, LinkedIn, TikTok', type: 'text', required: true },
        { name: 'tone',             label: 'Tone of Voice',             placeholder: 'e.g. Bold, Trust-building, Urgent, Casual', type: 'text', required: true },
      ]
    ),
    T(
      'Email Generator', 'email-generator-tool', 'Email Generator',
      'Write emails that get opened, read, and actioned every time',
      'Writing Tools', 'MailOpen',
      `You are a master email copywriter specializing in high open-rate and click-through emails.

EMAIL TYPE: {emailType}
SENDER: {senderName}
RECIPIENT: {recipientContext}
CORE MESSAGE: {coreMessage}
DESIRED ACTION: {desiredAction}
TONE: {tone}

Deliver:
- 3 Subject Line options (curiosity / benefit-driven / personalized) - mark recommended
- Preview Text: 80 chars optimized to complement subject
- Opening Line: Pattern-interrupt, no generic greetings
- Body: Short skimmable paragraphs, bullets for lists, bold key insight
- CTA: Single crystal-clear low-friction action
- Optional P.S. reinforcing the offer or adding urgency

Write the complete email now:`,
      [
        { name: 'emailType',        label: 'Type of Email',         placeholder: 'e.g. Cold outreach, Newsletter, Drip, Re-engagement, Announcement', type: 'text', required: true },
        { name: 'senderName',       label: 'Your Name and Company', placeholder: 'e.g. Nabin from Growthly', type: 'text', required: true },
        { name: 'recipientContext', label: 'Recipient Context',      placeholder: 'e.g. Warm leads who signed up but have not upgraded', type: 'text', required: true },
        { name: 'coreMessage',      label: 'Core Message / Offer',  placeholder: 'e.g. Introducing our new AI content calendar feature', type: 'textarea', required: true },
        { name: 'desiredAction',    label: 'Desired Reader Action', placeholder: 'e.g. Click to watch 2-min demo, Start free trial', type: 'text', required: true },
        { name: 'tone',             label: 'Tone of Voice',         placeholder: 'e.g. Professional, Warm, Conversational, Urgent', type: 'text', required: true },
      ]
    ),
    T(
      'Content Rewriter', 'content-rewriter', 'Content Rewriter',
      'Transform existing content into something fresher, sharper, and more effective',
      'Writing Tools', 'RefreshCw',
      `You are an expert editor and content strategist. Rewrite the provided content to make it dramatically better. Do not just rephrase - transform it.

REWRITE GOAL: {rewriteGoal}
TARGET PLATFORM / FORMAT: {platform}
TONE: {tone}

ORIGINAL CONTENT:
{originalContent}

REWRITING RULES:
- Strengthen the opening hook - first sentence must command attention
- Cut all filler words, weak adjectives, and passive voice
- Tighten every sentence - fewer words always wins
- Restructure for better logical flow if needed
- Bold the most important insight
- End with a stronger, decisive conclusion or CTA

OUTPUT:
**Rewritten Version:**
[Full rewritten content]

**Editor Notes:**
- [Change 1 and why]
- [Change 2 and why]
- [Change 3 and why]`,
      [
        { name: 'originalContent', label: 'Original Content to Rewrite', placeholder: 'Paste your existing content here...', type: 'textarea', required: true },
        { name: 'rewriteGoal',     label: 'Rewrite Goal',                placeholder: 'e.g. More engaging, More concise, More persuasive, More professional', type: 'text', required: true },
        { name: 'platform',        label: 'Target Platform / Format',    placeholder: 'e.g. LinkedIn post, Email newsletter, Landing page, Blog intro', type: 'text', required: false },
        { name: 'tone',            label: 'Desired Tone',                placeholder: 'e.g. Bold, Warm, Expert, Casual, Authoritative', type: 'text', required: true },
      ]
    ),
    T(
      'Paragraph Expander', 'paragraph-expander', 'Paragraph Expander',
      'Expand bullet points or rough notes into rich, detailed paragraphs',
      'Writing Tools', 'Maximize2',
      `You are a skilled long-form content writer. Expand the following brief notes into detailed, compelling prose.

CONTEXT / SUBJECT: {context}
DEPTH LEVEL: {depth}
TONE: {tone}

BRIEF NOTES / BULLET POINTS:
{originalText}

EXPANSION GUIDELINES:
- Introduce each idea with a punchy, clear topic sentence
- Add supporting evidence, examples, or analogies per point
- Use smooth transitions for natural flowing prose
- Add at least one memorable metaphor or real-world example per major idea
- Conclude with a synthesis statement that ties all ideas together
- Output must be flowing paragraphs - NO bullet points in the final result

Write the fully expanded, publication-ready content now:`,
      [
        { name: 'originalText', label: 'Notes / Bullet Points to Expand', placeholder: 'e.g.\n- AI reduces content creation time by 80%\n- Brands using AI see 3x more engagement\n- Growthly connects to 6 platforms in one click', type: 'textarea', required: true },
        { name: 'context',      label: 'Topic / Context',                  placeholder: 'e.g. The business case for using AI in social media marketing', type: 'text', required: true },
        { name: 'depth',        label: 'Depth Level',                      placeholder: 'e.g. Surface overview, Intermediate, Deep-dive technical', type: 'text', required: false },
        { name: 'tone',         label: 'Tone of Voice',                    placeholder: 'e.g. Informative, Inspiring, Technical, Conversational', type: 'text', required: true },
      ]
    ),
  ];

  for (const t of templates) {
    await prisma.globalTemplate.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name, title: t.title, description: t.description,
        category: t.category, icon: t.icon, prompt: t.prompt,
        variables: t.variables, isActive: t.isActive,
      },
      create: t,
    });
    console.log('  Seeded: ' + t.category + ' > ' + t.title);
  }

  console.log('\nDone! ' + templates.length + ' high-quality global templates seeded successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
