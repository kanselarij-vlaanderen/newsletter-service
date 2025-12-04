const BELGA_USER = process.env.BELGA_FTP_USERNAME;
const BELGA_PASSWORD = process.env.BELGA_FTP_PASSWORD;
const BELGA_HOST = process.env.BELGA_FTP_HOST || 'ftp.belga.be';
const BELGA_STORAGE_PATH = process.env.XML_STORAGE_PATH || `/data`;

const BELGA = {
  USER: BELGA_USER,
  PASSWORD: BELGA_PASSWORD,
  HOST: BELGA_HOST,
  STORAGE_PATH: BELGA_STORAGE_PATH,
};

const MAILCHIMP_API = process.env.MAILCHIMP_API;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || "us3"; // us3 test, us5 prod
const MAILCHIMP_FROM_NAME = process.env.MAILCHIMP_FROM_NAME;
const MAILCHIMP_REPLY_TO = process.env.MAILCHIMP_REPLY_TO;
const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID;
const MAILCHIMP_INTEREST_CATEGORY_ID = process.env.MAILCHIMP_INTEREST_CATEGORY_ID;

const MAILCHIMP = {
  API: MAILCHIMP_API,
  SERVER: MAILCHIMP_SERVER,
  FROM_NAME: MAILCHIMP_FROM_NAME,
  REPLY_TO: MAILCHIMP_REPLY_TO,
  LIST_ID: MAILCHIMP_LIST_ID,
  INTEREST_CATEGORY_ID: MAILCHIMP_INTEREST_CATEGORY_ID,
};


const AGENDA_ITEM_TYPES = {
  NOTA: 'http://themis.vlaanderen.be/id/concept/agendapunt-type/dd47a8f8-3ad2-4d5a-8318-66fc02fe80fd',
  MEDEDELING: 'http://themis.vlaanderen.be/id/concept/agendapunt-type/8f8adcf0-58ef-4edc-9e36-0c9095fd76b0',
};

const ROLES = {
  ADMIN: 'http://themis.vlaanderen.be/id/gebruikersrol/9a969b13-e80b-424f-8a82-a402bcb42bc5',
  KANSELARIJ: 'http://themis.vlaanderen.be/id/gebruikersrol/ab39b02a-14a5-4aa9-90bd-e0fa268b0f3d',
  SECRETARIE: 'http://themis.vlaanderen.be/id/gebruikersrol/c2ef1785-bf28-458f-952d-aa40989347d2',
  KORT_BESTEK: 'http://themis.vlaanderen.be/id/gebruikersrol/ca20a872-7743-4998-b479-06b003f49daf',
}

const MEETING_KIND_TYPES = {
  EP: 'http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/2387564a-0897-4a62-9b9a-d1755eece7af',
  BM: 'http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/62a0a3c3-44ed-4f35-8b46-1d50616ad42c',
  PVV: 'http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/9b4701f8-a136-4009-94c6-d64fdc96b9a2',
}

const ANNOUNCEMENT_HEADER_SUBTEXT = process.env.ANNOUNCEMENT_HEADER_SUBTEXT || '';

export {
  BELGA,
  MAILCHIMP,
  AGENDA_ITEM_TYPES,
  ROLES,
  MEETING_KIND_TYPES,
  ANNOUNCEMENT_HEADER_SUBTEXT,
}