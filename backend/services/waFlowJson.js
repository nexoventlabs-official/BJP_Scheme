/**
 * WhatsApp Flow JSON definitions for BJP Nalam Thittam (endpoint mode).
 *
 * All visible text is data-bound (`${data.*}`) so the Flow Endpoint supplies it
 * in the user's chosen language (EN/TA). Navigation is driven by the endpoint
 * returning the next screen from each `data_exchange`.
 *
 * Two flows:
 *   1. Register  — REG_START → REG_CONFIRM → REG_SCHEMES → REG_SCHEME_DETAIL → REG_DONE
 *   2. Service   — SERVICE_MENU → { PROFILE | MY_SCHEMES→APP_STATUS |
 *                  APPLY_LIST→APPLY_DETAIL→APPLY_DONE | REFERRAL | MEMBERS |
 *                  BOOTH_HOME→(BOOTH_DISTRICT→BOOTH_ASSEMBLY→BOOTH_BOOTH)→BOOTH_DONE
 *                  | BOOTH_STATUS | INFO }
 */

const S = (example = '') => ({ type: 'string', __example__: example });
const B = (example = false) => ({ type: 'boolean', __example__: example });
const ARR = () => ({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      image: { type: 'string' },
    },
  },
  __example__: [{ id: '1', title: 'Item', description: '', image: '' }],
});

// Banner Image — matched EXACTLY to the TVK reference: width:1000, height:125
// (8:1). Both must be set; `height` is what controls the banner thickness, so
// 125 keeps it a slim wide strip (height:200 rendered a too-tall ~2:1 box).
const bannerImage = () => ({
  type: 'Image',
  src: '${data.banner}',
  width: 1000,
  height: 125,
  'scale-type': 'cover',
  'alt-text': 'BJP Nalam Thittam',
  visible: '${data.has_banner}',
});

function footer(label, action) {
  return { type: 'Footer', label, 'on-click-action': action };
}

/* ─────────────────────────── REGISTER FLOW ─────────────────────────── */
function buildRegisterFlowJSON() {
  return {
    version: '7.0',
    data_api_version: '3.0',
    routing_model: {
      REG_START: ['REG_CONFIRM'],
      REG_CONFIRM: ['REG_SCHEMES'],
      REG_SCHEMES: ['REG_SCHEME_DETAIL'],
      REG_SCHEME_DETAIL: ['REG_DONE'],
      REG_DONE: [],
    },
    screens: [
      {
        id: 'REG_START',
        title: '${data.title}',
        data: {
          banner: S('iVBORw0KGgo'), has_banner: B(true),
          title: S('Voter Registration'), body: S('Enter your EPIC number.'),
          error_text: S(''), has_error: B(false),
          init_phone: S('919999999999'), init_epic: S(''),
          mobile_label: S('WhatsApp Number'), epic_label: S('EPIC (Voter ID) Number'),
          cta: S('Continue'),
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            bannerImage(),
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            { type: 'TextBody', text: '⚠️ ${data.error_text}', visible: '${data.has_error}' },
            { type: 'TextInput', name: 'mobile', label: '${data.mobile_label}', required: false, 'input-type': 'phone', enabled: false, 'init-value': '${data.init_phone}' },
            { type: 'TextInput', name: 'epic_no', label: '${data.epic_label}', required: true, 'input-type': 'text', 'init-value': '${data.init_epic}' },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'lookup_epic', epic_no: '${form.epic_no}' } }),
          ],
        },
      },
      {
        id: 'REG_CONFIRM',
        title: '${data.title}',
        data: { title: S('Confirm'), confirm_md: S('# Confirm\n| Field | Value |\n| --- | --- |\n| Name | X |'), cta: S('Continue') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'RichText', text: '${data.confirm_md}' },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'confirm_voter' } }),
          ],
        },
      },
      {
        id: 'REG_SCHEMES',
        title: '${data.title}',
        data: {
          banner: S('iVBORw0KGgo'), has_banner: B(true),
          title: S('Choose a Scheme'), body: S('Select a scheme to apply for.'), list_label: S('Schemes'),
          schemes: ARR(), cta: S('Continue'),
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            bannerImage(),
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            { type: 'RadioButtonsGroup', name: 'scheme', label: '${data.list_label}', 'data-source': '${data.schemes}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'pick_scheme', scheme: '${form.scheme}' } }),
          ],
        },
      },
      {
        id: 'REG_SCHEME_DETAIL',
        title: '${data.title}',
        data: {
          banner: S('iVBORw0KGgo'), has_banner: B(true),
          title: S('Scheme'), body: S('Scheme details.'), cta: S('Confirm & Apply'),
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            bannerImage(),
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'confirm_scheme' } }),
          ],
        },
      },
      {
        id: 'REG_DONE',
        title: '${data.title}',
        terminal: true,
        success: true,
        data: { title: S('Done'), info_title: S('🙏 Registered'), info_body: S('You are now registered.'), cta: S('Close'), flow_token: S('') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.info_title}' },
            { type: 'TextBody', text: '${data.info_body}' },
            footer('${data.cta}', { name: 'complete', payload: { flow_token: '${data.flow_token}' } }),
          ],
        },
      },
    ],
  };
}

/* ─────────────────────────── SERVICE FLOW ─────────────────────────── */
function buildServiceFlowJSON() {
  const richDone = (id) => ({
    id,
    title: '${data.title}',
    terminal: true,
    success: true,
    data: { title: S('Details'), body_md: S('# Details'), cta: S('Done'), flow_token: S(''), post_action: S('') },
    layout: {
      type: 'SingleColumnLayout',
      children: [
        { type: 'RichText', text: '${data.body_md}' },
        footer('${data.cta}', { name: 'complete', payload: { flow_token: '${data.flow_token}', post_action: '${data.post_action}' } }),
      ],
    },
  });

  return {
    version: '7.0',
    data_api_version: '3.0',
    routing_model: {
      SERVICE_MENU: ['PROFILE', 'MY_SCHEMES', 'APPLY_LIST', 'REFERRAL', 'MEMBERS', 'BOOTH_HOME', 'BOOTH_STATUS', 'INFO'],
      MY_SCHEMES: ['APP_STATUS', 'INFO'],
      APP_STATUS: [],
      APPLY_LIST: ['APPLY_DETAIL', 'INFO'],
      APPLY_DETAIL: ['APPLY_DONE'],
      APPLY_DONE: [],
      PROFILE: [],
      REFERRAL: [],
      MEMBERS: ['INFO'],
      BOOTH_HOME: ['BOOTH_DISTRICT', 'BOOTH_DONE', 'BOOTH_STATUS'],
      BOOTH_DISTRICT: ['BOOTH_ASSEMBLY'],
      BOOTH_ASSEMBLY: ['BOOTH_BOOTH'],
      BOOTH_BOOTH: ['BOOTH_DONE'],
      BOOTH_DONE: [],
      BOOTH_STATUS: [],
      INFO: [],
    },
    screens: [
      {
        id: 'SERVICE_MENU',
        title: '${data.title}',
        data: {
          banner: S('iVBORw0KGgo'), has_banner: B(true),
          title: S('Select a Service'), body: S('Choose an option below.'), list_label: S('Services'),
          services: ARR(), cta: S('Continue'),
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            bannerImage(),
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            { type: 'RadioButtonsGroup', name: 'service', label: '${data.list_label}', 'data-source': '${data.services}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'pick_service', service: '${form.service}' } }),
          ],
        },
      },
      // My Schemes → list → status
      {
        id: 'MY_SCHEMES',
        title: '${data.title}',
        data: { title: S('My Schemes'), body: S('Your applied schemes.'), list_label: S('Schemes'), items: ARR(), cta: S('View Status') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            { type: 'RadioButtonsGroup', name: 'applied', label: '${data.list_label}', 'data-source': '${data.items}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'view_status', applied: '${form.applied}' } }),
          ],
        },
      },
      richDone('APP_STATUS'),
      // Apply Schemes → list → detail → done
      {
        id: 'APPLY_LIST',
        title: '${data.title}',
        data: { title: S('Apply for Schemes'), body: S('Select a scheme to apply.'), list_label: S('Schemes'), items: ARR(), cta: S('Continue') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            { type: 'RadioButtonsGroup', name: 'scheme', label: '${data.list_label}', 'data-source': '${data.items}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'apply_pick', scheme: '${form.scheme}' } }),
          ],
        },
      },
      {
        id: 'APPLY_DETAIL',
        title: '${data.title}',
        data: { banner: S('iVBORw0KGgo'), has_banner: B(true), title: S('Scheme'), body: S('Details.'), cta: S('Confirm & Apply') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            bannerImage(),
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'apply_confirm' } }),
          ],
        },
      },
      richDone('APPLY_DONE'),
      richDone('PROFILE'),
      richDone('REFERRAL'),
      // My Members list (icons) — terminal, just a display list
      {
        id: 'MEMBERS',
        title: '${data.title}',
        terminal: true,
        success: true,
        data: { title: S('My Members'), body: S('Members you referred.'), list_label: S('Members'), items: ARR(), cta: S('Done'), flow_token: S(''), post_action: S('') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.body}' },
            { type: 'RadioButtonsGroup', name: 'member', label: '${data.list_label}', 'data-source': '${data.items}', required: false },
            footer('${data.cta}', { name: 'complete', payload: { flow_token: '${data.flow_token}', post_action: '${data.post_action}' } }),
          ],
        },
      },
      // Booth President
      {
        id: 'BOOTH_HOME',
        title: '${data.title}',
        data: { title: S('Be a Booth President'), current_md: S('District: X\nAssembly: Y\nBooth: Z'), another_label: S('Apply for a different booth'), cta: S('Confirm this Booth') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'TextBody', text: '${data.current_md}' },
            { type: 'EmbeddedLink', text: '${data.another_label}', 'on-click-action': { name: 'data_exchange', payload: { action: 'booth_another' } } },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'booth_confirm_current' } }),
          ],
        },
      },
      {
        id: 'BOOTH_DISTRICT',
        title: '${data.title}',
        data: { title: S('Select District'), label: S('District'), districts: ARR(), cta: S('Continue') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'Dropdown', name: 'district', label: '${data.label}', 'data-source': '${data.districts}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'booth_district', district: '${form.district}' } }),
          ],
        },
      },
      {
        id: 'BOOTH_ASSEMBLY',
        title: '${data.title}',
        data: { title: S('Select Assembly'), label: S('Assembly'), assemblies: ARR(), cta: S('Continue') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'Dropdown', name: 'assembly', label: '${data.label}', 'data-source': '${data.assemblies}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'booth_assembly', assembly: '${form.assembly}' } }),
          ],
        },
      },
      {
        id: 'BOOTH_BOOTH',
        title: '${data.title}',
        data: { title: S('Select Booth'), label: S('Booth'), booths: ARR(), cta: S('Confirm') },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.title}' },
            { type: 'Dropdown', name: 'booth', label: '${data.label}', 'data-source': '${data.booths}', required: true },
            footer('${data.cta}', { name: 'data_exchange', payload: { action: 'booth_confirm_custom', booth: '${form.booth}' } }),
          ],
        },
      },
      richDone('BOOTH_DONE'),
      richDone('BOOTH_STATUS'),
      richDone('INFO'),
    ],
  };
}

module.exports = { buildRegisterFlowJSON, buildServiceFlowJSON };
