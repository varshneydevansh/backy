import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageRenderer, type PageContent } from '../src/components/PageRenderer';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const content: PageContent = {
  canvasSize: { width: 900, height: 360 },
  elements: [
    {
      id: 'rich-heading',
      type: 'heading',
      x: 24,
      y: 24,
      width: 420,
      height: 64,
      props: {
        level: 'h2',
        fontSize: 42,
        fontWeight: '700',
        color: '#dc2626',
        textAlign: 'center',
        lineHeight: 1.2,
        textTransform: 'uppercase',
        letterSpacing: 2,
        wordSpacing: 4,
        textShadow: '1px 2px 3px rgba(15, 23, 42, 0.35)',
        textIndent: 6,
        textDecoration: 'underline',
        fontStyle: 'italic',
        content: [
          {
            type: 'h2',
            children: [{ text: 'Slate Heading Rendered' }],
          },
        ],
      },
    },
    {
      id: 'rich-paragraph',
      type: 'paragraph',
      x: 24,
      y: 104,
      width: 520,
      height: 80,
      props: {
        tag: 'p',
        content: [
          {
            type: 'p',
            children: [{ text: 'Slate paragraph for custom frontend output.' }],
          },
        ],
      },
    },
    {
      id: 'rich-quote',
      type: 'quote',
      x: 24,
      y: 204,
      width: 520,
      height: 96,
      props: {
        content: [
          {
            type: 'blockquote',
            children: [{ text: 'Slate quote for public renderer.' }],
          },
        ],
        citation: 'Renderer Smoke',
        quoteBorderColor: '#7c3aed',
        quoteBorderWidth: 6,
      },
    },
    {
      id: 'styled-box',
      type: 'box',
      x: 580,
      y: 24,
      width: 260,
      height: 120,
      props: {
        backgroundColor: '#ecfeff',
        borderRadius: 14,
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: '#0891b2',
        padding: 18,
        margin: 4,
        boxShadow: '0 10px 20px rgba(8, 145, 178, 0.25)',
      },
      children: [
        {
          id: 'styled-box-text',
          type: 'text',
          x: 12,
          y: 12,
          width: 180,
          height: 28,
          props: {
            content: 'Styled box child',
          },
        },
      ],
    },
    {
      id: 'styled-button',
      type: 'button',
      x: 580,
      y: 168,
      width: 220,
      height: 56,
      props: {
        label: 'Styled CTA',
        href: '/signup',
        target: '_blank',
        rel: 'noopener noreferrer',
        ariaLabel: 'Open signup',
        title: 'Signup CTA',
        backgroundColor: '#16a34a',
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '700',
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#fde047',
        padding: 14,
        margin: 6,
        boxShadow: '0 8px 16px rgba(22, 163, 74, 0.25)',
      },
    },
    {
      id: 'styled-image',
      type: 'image',
      x: 24,
      y: 320,
      width: 180,
      height: 90,
      props: {
        src: 'https://cdn.backy.test/hero.png',
        alt: 'Styled image alt',
        title: 'Styled image title',
        objectFit: 'contain',
        objectPosition: '25% 75%',
        borderRadius: 16,
        borderWidth: 4,
        borderStyle: 'solid',
        borderColor: '#f97316',
        padding: 3,
        margin: 5,
        boxShadow: '0 12px 24px rgba(249, 115, 22, 0.3)',
      },
    },
    {
      id: 'styled-video',
      type: 'video',
      x: 224,
      y: 320,
      width: 200,
      height: 112,
      props: {
        src: 'https://cdn.backy.test/clip.mp4',
        poster: 'https://cdn.backy.test/poster.jpg',
        objectFit: 'contain',
        controls: true,
        autoplay: true,
        loop: true,
        muted: true,
        playsInline: true,
        borderRadius: 18,
        borderWidth: 2,
        borderStyle: 'dotted',
        borderColor: '#2563eb',
        boxShadow: '0 9px 18px rgba(37, 99, 235, 0.28)',
      },
    },
    {
      id: 'styled-nav',
      type: 'nav',
      x: 444,
      y: 320,
      width: 260,
      height: 72,
      props: {
        navItems: [
          { label: 'Docs', href: '/docs' },
          { label: 'Pricing', href: '/pricing' },
        ],
        navDirection: 'horizontal',
        gap: 22,
        padding: 11,
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        borderRadius: 10,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#64748b',
        boxShadow: '0 6px 14px rgba(100, 116, 139, 0.22)',
        ariaLabel: 'Styled nav',
      },
    },
    {
      id: 'styled-embed',
      type: 'embed',
      x: 724,
      y: 320,
      width: 220,
      height: 120,
      props: {
        src: 'https://example.com/embed',
        title: 'Styled embed',
        loading: 'eager',
        borderRadius: 9,
        borderWidth: 3,
        borderStyle: 'double',
        borderColor: '#7c3aed',
        boxShadow: '0 7px 16px rgba(124, 58, 237, 0.25)',
      },
    },
    {
      id: 'styled-map',
      type: 'map',
      x: 24,
      y: 440,
      width: 220,
      height: 120,
      props: {
        address: 'Mumbai India',
        zoom: 17,
        title: 'Styled map',
        loading: 'eager',
        referrerPolicy: 'origin',
        borderRadius: 13,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#0e7490',
        boxShadow: '0 11px 22px rgba(14, 116, 144, 0.25)',
      },
    },
    {
      id: 'styled-input',
      type: 'input',
      x: 264,
      y: 440,
      width: 260,
      height: 96,
      props: {
        label: 'Email field',
        name: 'styled_email',
        inputType: 'email',
        required: true,
        placeholder: 'hello@example.com',
        pattern: '.+@example[.]com',
        minLength: 6,
        maxLength: 64,
        defaultValue: 'team@example.com',
        helpText: 'Use your work email.',
        padding: 13,
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: '#db2777',
        borderRadius: 11,
        backgroundColor: '#fdf2f8',
        color: '#831843',
        boxShadow: '0 5px 12px rgba(219, 39, 119, 0.2)',
      },
    },
    {
      id: 'styled-textarea',
      type: 'textarea',
      x: 544,
      y: 440,
      width: 260,
      height: 120,
      props: {
        label: 'Message field',
        name: 'styled_message',
        required: true,
        placeholder: 'Tell us more',
        rows: 5,
        minLength: 10,
        maxLength: 240,
        defaultValue: 'Textarea body',
        helpText: 'Minimum ten characters.',
        padding: 15,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#059669',
        borderRadius: 12,
        backgroundColor: '#ecfdf5',
        color: '#064e3b',
        boxShadow: '0 6px 16px rgba(5, 150, 105, 0.22)',
      },
    },
    {
      id: 'styled-password',
      type: 'input',
      x: 824,
      y: 440,
      width: 220,
      height: 96,
      props: {
        label: 'Password field',
        name: 'styled_password',
        inputType: 'password',
        required: true,
        placeholder: 'Secret',
        minLength: 8,
        maxLength: 72,
      },
    },
    {
      id: 'styled-select',
      type: 'select',
      x: 824,
      y: 460,
      width: 220,
      height: 96,
      props: {
        label: 'Plan field',
        name: 'styled_plan',
        required: true,
        placeholder: 'Choose a plan',
        options: ['Starter', 'Growth', 'Scale'],
        defaultValue: 'Growth',
        helpText: 'Choose a plan.',
        padding: 12,
        borderWidth: 2,
        borderStyle: 'double',
        borderColor: '#4f46e5',
        borderRadius: 10,
        backgroundColor: '#eef2ff',
        color: '#312e81',
        boxShadow: '0 4px 10px rgba(79, 70, 229, 0.2)',
      },
    },
    {
      id: 'styled-checkbox',
      type: 'checkbox',
      x: 24,
      y: 590,
      width: 240,
      height: 120,
      props: {
        label: 'Channels field',
        name: 'styled_channels',
        required: true,
        options: ['Email', 'SMS'],
        value: 'SMS',
        defaultValue: 'SMS',
        helpText: 'Pick channels.',
        padding: 10,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#7c2d12',
        borderRadius: 8,
        backgroundColor: '#fff7ed',
        boxShadow: '0 5px 14px rgba(124, 45, 18, 0.2)',
      },
    },
    {
      id: 'styled-form',
      type: 'form',
      x: 284,
      y: 590,
      width: 300,
      height: 180,
      props: {
        formId: 'contact_form',
        formTitle: 'Contact Form',
        formActive: true,
        formAudience: 'authenticated',
        method: 'POST',
        enableHoneypot: true,
        enableCaptcha: true,
        contactShareEnabled: true,
        collectionWriteEnabled: true,
        collectionWriteCollectionId: 'leads_collection',
        collectionWriteSlugField: 'name',
        gap: 12,
        borderWidth: 2,
        borderStyle: 'solid',
        borderColor: '#0284c7',
        borderRadius: 10,
        padding: 14,
      },
      children: [
        {
          id: 'styled-form-input',
          type: 'input',
          x: 0,
          y: 0,
          width: 220,
          height: 72,
          props: {
            label: 'Name',
            name: 'name',
            required: true,
            placeholder: 'Your name',
          },
        },
      ],
    },
    {
      id: 'styled-repeater',
      type: 'repeater',
      x: 604,
      y: 590,
      width: 360,
      height: 220,
      props: {
        datasetId: 'renderer_smoke_repeater',
        titleField: 'title',
        descriptionField: 'summary',
        imageField: 'thumbnail',
        columns: 1,
        gap: 18,
        records: [
          {
            id: 'record-1',
            slug: 'repeater-record',
            href: '/records/repeater-record',
            values: {
              title: 'Repeater record title',
              summary: 'Repeater record summary',
              thumbnail: {
                url: 'https://cdn.backy.test/repeater-record.jpg',
              },
            },
          },
        ],
      },
    },
    {
      id: 'custom-action-form',
      type: 'form',
      x: 24,
      y: 840,
      width: 260,
      height: 120,
      props: {
        formId: 'custom_action_form',
        formTitle: 'Custom Action Form',
        formActive: false,
        actionUrl: '/api/custom-lead-submit',
        method: 'POST',
        enableHoneypot: true,
      },
      children: [
        {
          id: 'custom-action-input',
          type: 'input',
          x: 0,
          y: 0,
          width: 220,
          height: 64,
          props: {
            label: 'Email',
            name: 'custom_email',
            inputType: 'email',
          },
        },
      ],
    },
  ],
};

const html = renderToStaticMarkup(
  <PageRenderer content={content} isPreview siteId="site_renderer_smoke" pageId="page_renderer_smoke" />,
);

assert(html.includes('Slate Heading Rendered'), `Heading Slate content was not rendered: ${html}`);
assert(html.includes('font-size:42px'), `Heading font size was not rendered: ${html}`);
assert(html.includes('font-weight:700'), `Heading font weight was not rendered: ${html}`);
assert(html.includes('color:#dc2626'), `Heading text color was not rendered: ${html}`);
assert(html.includes('text-align:center'), `Heading text align was not rendered: ${html}`);
assert(html.includes('line-height:1.2'), `Heading line height was not rendered: ${html}`);
assert(html.includes('text-transform:uppercase'), `Heading text transform was not rendered: ${html}`);
assert(html.includes('letter-spacing:2px'), `Heading letter spacing was not rendered: ${html}`);
assert(html.includes('word-spacing:4px'), `Heading word spacing was not rendered: ${html}`);
assert(html.includes('text-shadow:1px 2px 3px rgba(15, 23, 42, 0.35)'), `Heading text shadow was not rendered: ${html}`);
assert(html.includes('text-indent:6px'), `Heading text indent was not rendered: ${html}`);
assert(html.includes('text-decoration:underline'), `Heading text decoration was not rendered: ${html}`);
assert(html.includes('font-style:italic'), `Heading font style was not rendered: ${html}`);
assert(html.includes('Slate paragraph for custom frontend output.'), `Paragraph Slate content was not rendered: ${html}`);
assert(html.includes('Slate quote for public renderer.'), `Quote Slate content was not rendered: ${html}`);
assert(html.includes('Renderer Smoke'), `Quote citation was not rendered: ${html}`);
assert(html.includes('border-left:6px solid #7c3aed'), `Quote border styling was not rendered: ${html}`);
assert(html.includes('Styled box child'), `Styled box child was not rendered: ${html}`);
assert(html.includes('background-color:#ecfeff'), `Container background color was not rendered: ${html}`);
assert(html.includes('border-width:3px'), `Container border width was not rendered: ${html}`);
assert(html.includes('border-style:dashed'), `Container border style was not rendered: ${html}`);
assert(html.includes('border-color:#0891b2'), `Container border color was not rendered: ${html}`);
assert(html.includes('box-shadow:0 10px 20px rgba(8, 145, 178, 0.25)'), `Container shadow was not rendered: ${html}`);
assert(html.includes('href="/signup"'), `Button href was not rendered: ${html}`);
assert(html.includes('aria-label="Open signup"'), `Button aria label was not rendered: ${html}`);
assert(html.includes('Styled CTA'), `Button label was not rendered: ${html}`);
assert(html.includes('background-color:#16a34a'), `Button background was not rendered: ${html}`);
assert(html.includes('font-size:18px'), `Button font size was not rendered: ${html}`);
assert(html.includes('border-radius:12px'), `Button border radius was not rendered: ${html}`);
assert(html.includes('border-width:2px'), `Button border width was not rendered: ${html}`);
assert(html.includes('border-style:solid'), `Button border style was not rendered: ${html}`);
assert(html.includes('border-color:#fde047'), `Button border color was not rendered: ${html}`);
assert(html.includes('margin:6px'), `Button margin was not rendered: ${html}`);
assert(html.includes('box-shadow:0 8px 16px rgba(22, 163, 74, 0.25)'), `Button shadow was not rendered: ${html}`);
assert(html.includes('src="https://cdn.backy.test/hero.png"'), `Image src was not rendered: ${html}`);
assert(html.includes('alt="Styled image alt"'), `Image alt was not rendered: ${html}`);
assert(html.includes('object-fit:contain'), `Image object fit was not rendered: ${html}`);
assert(html.includes('object-position:25% 75%'), `Image object position was not rendered: ${html}`);
assert(html.includes('border-radius:16px'), `Image border radius was not rendered: ${html}`);
assert(html.includes('border-width:4px'), `Image border width was not rendered: ${html}`);
assert(html.includes('border-color:#f97316'), `Image border color was not rendered: ${html}`);
assert(html.includes('box-shadow:0 12px 24px rgba(249, 115, 22, 0.3)'), `Image shadow was not rendered: ${html}`);
assert(html.includes('src="https://cdn.backy.test/clip.mp4"'), `Video src was not rendered: ${html}`);
assert(html.includes('poster="https://cdn.backy.test/poster.jpg"'), `Video poster was not rendered: ${html}`);
assert(html.includes('border-radius:18px'), `Video border radius was not rendered: ${html}`);
assert(html.includes('border-style:dotted'), `Video border style was not rendered: ${html}`);
assert(html.includes('border-color:#2563eb'), `Video border color was not rendered: ${html}`);
assert(html.includes('aria-label="Styled nav"'), `Nav aria label was not rendered: ${html}`);
assert(html.includes('href="/docs"'), `Nav item href was not rendered: ${html}`);
assert(html.includes('gap:22px'), `Nav gap was not rendered: ${html}`);
assert(html.includes('border-color:#64748b'), `Nav border color was not rendered: ${html}`);
assert(html.includes('box-shadow:0 6px 14px rgba(100, 116, 139, 0.22)'), `Nav shadow was not rendered: ${html}`);
assert(html.includes('title="Styled embed"'), `Embed title was not rendered: ${html}`);
assert(html.includes('src="https://example.com/embed"'), `Embed src was not rendered: ${html}`);
assert(html.includes('border-style:double'), `Embed border style was not rendered: ${html}`);
assert(html.includes('border-color:#7c3aed'), `Embed border color was not rendered: ${html}`);
assert(html.includes('title="Styled map"'), `Map title was not rendered: ${html}`);
assert(html.includes('q=Mumbai+India'), `Map address was not rendered: ${html}`);
assert(html.includes('z=17'), `Map zoom was not rendered: ${html}`);
assert(html.includes('border-color:#0e7490'), `Map border color was not rendered: ${html}`);
assert(html.includes('name="styled_email"'), `Input name was not rendered: ${html}`);
assert(html.includes('type="email"'), `Input type was not rendered: ${html}`);
assert(html.includes('pattern=".+@example[.]com"'), `Input pattern was not rendered: ${html}`);
assert(html.includes('minLength="6"'), `Input minLength was not rendered: ${html}`);
assert(html.includes('maxLength="64"'), `Input maxLength was not rendered: ${html}`);
assert(html.includes('value="team@example.com"'), `Input default value was not rendered: ${html}`);
assert(html.includes('border:3px dashed #db2777'), `Input border was not rendered: ${html}`);
assert(html.includes('background-color:#fdf2f8'), `Input background was not rendered: ${html}`);
assert(html.includes('box-shadow:0 5px 12px rgba(219, 39, 119, 0.2)'), `Input shadow was not rendered: ${html}`);
assert(html.includes('name="styled_message"'), `Textarea name was not rendered: ${html}`);
assert(html.includes('rows="5"'), `Textarea rows were not rendered: ${html}`);
assert(html.includes('Textarea body'), `Textarea default value was not rendered: ${html}`);
assert(html.includes('border:2px solid #059669'), `Textarea border was not rendered: ${html}`);
assert(html.includes('box-shadow:0 6px 16px rgba(5, 150, 105, 0.22)'), `Textarea shadow was not rendered: ${html}`);
assert(html.includes('name="styled_password"'), `Password input name was not rendered: ${html}`);
assert(html.includes('type="password"'), `Password input type was not preserved: ${html}`);
assert(html.includes('name="styled_plan"'), `Select name was not rendered: ${html}`);
assert(html.includes('<option value="" disabled="">Choose a plan</option>'), `Select placeholder was not rendered: ${html}`);
assert(html.includes('<option value="Growth" selected="">Growth</option>'), `Select default value was not rendered: ${html}`);
assert(html.includes('border:2px double #4f46e5'), `Select border was not rendered: ${html}`);
assert(html.includes('box-shadow:0 4px 10px rgba(79, 70, 229, 0.2)'), `Select shadow was not rendered: ${html}`);
assert(html.includes('name="styled_channels"'), `Checkbox name was not rendered: ${html}`);
assert(html.includes('checked="" value="SMS"') || html.includes('value="SMS" checked=""'), `Checkbox default value was not rendered: ${html}`);
assert(html.includes('border-color:#7c2d12'), `Checkbox wrapper border was not rendered: ${html}`);
assert(html.includes('box-shadow:0 5px 14px rgba(124, 45, 18, 0.2)'), `Checkbox wrapper shadow was not rendered: ${html}`);
assert(html.includes('action="/api/sites/site_renderer_smoke/forms/contact_form/submissions"'), `Form Backy action was not rendered: ${html}`);
assert(html.includes('method="POST"'), `Form method was not rendered: ${html}`);
assert(html.includes('name="honeypot"'), `Form honeypot was not rendered: ${html}`);
assert(html.includes('name="pageId"'), `Form page hidden input was not rendered: ${html}`);
assert(html.includes('value="page_renderer_smoke"'), `Form page hidden value was not rendered: ${html}`);
assert(html.includes('Contact Form'), `Form title was not rendered: ${html}`);
assert(html.includes('data-backy-form-id="contact_form"'), `Form id contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-form-active="true"'), `Form active contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-form-audience="authenticated"'), `Form audience contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-captcha-required="true"'), `Form captcha contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-contact-share="true"'), `Form contact-share contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-collection-write="true"'), `Form collection-write contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-collection-id="leads_collection"'), `Form collection id contract attribute was not rendered: ${html}`);
assert(html.includes('data-backy-collection-slug-field="name"'), `Form collection slug field contract attribute was not rendered: ${html}`);
assert(html.includes('name="captchaToken"'), `Form captcha token transport field was not rendered: ${html}`);
assert(html.includes('action="/api/custom-lead-submit"'), `Custom form action was not rendered: ${html}`);
assert(html.includes('Custom Action Form'), `Custom form title was not rendered: ${html}`);
assert(html.includes('name="custom_email"'), `Custom form child input was not rendered: ${html}`);
assert(html.includes('data-backy-form-active="false"'), `Inactive custom form state was not rendered: ${html}`);
assert(html.includes('aria-disabled="true"'), `Inactive custom form aria state was not rendered: ${html}`);
assert((html.match(/name="pageId"/g) || []).length === 1, `Custom form should not receive Backy page hidden inputs: ${html}`);
assert(!html.includes('/api/sites/site_renderer_smoke/forms/custom_action_form/submissions'), `Custom form was converted to Backy action: ${html}`);
assert(html.includes('data-backy-repeater="renderer_smoke_repeater"'), `Repeater dataset id was not rendered: ${html}`);
assert(html.includes('href="/records/repeater-record"'), `Repeater record href was not rendered: ${html}`);
assert(html.includes('src="https://cdn.backy.test/repeater-record.jpg"'), `Repeater image src was not rendered: ${html}`);
assert(html.includes('alt="Repeater record title"'), `Repeater image alt was not rendered: ${html}`);
assert(html.includes('Repeater record title'), `Repeater title was not rendered: ${html}`);
assert(html.includes('Repeater record summary'), `Repeater summary was not rendered: ${html}`);

console.log(JSON.stringify({
  ok: true,
  rendered: {
    heading: true,
    headingTypography: true,
    paragraph: true,
    quote: true,
    citation: true,
    styledBox: true,
    styledButton: true,
    styledImage: true,
    styledVideo: true,
    styledNav: true,
    styledEmbed: true,
    styledMap: true,
    styledInput: true,
    styledTextarea: true,
    styledSelect: true,
    styledCheckbox: true,
    styledForm: true,
    styledRepeater: true,
  },
}, null, 2));
