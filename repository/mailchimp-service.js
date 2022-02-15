import mailchimpConnection from '@mailchimp/mailchimp_marketing';
const { createNewsLetter } = require('../util/html');

const requiredEnvironmentVariables = [
  'MAILCHIMP_API',
  'MAILCHIMP_FROM_NAME',
  'MAILCHIMP_REPLY_TO',
  'MAILCHIMP_LIST_ID',
  'MAILCHIMP_INTEREST_CATEGORY_ID',
  'MAILCHIMP_KIND_CATEGORY_ID',
  'BELGA_FTP_USERNAME',
  'BELGA_FTP_PASSWORD'
];

/*
requiredEnvironmentVariables.forEach((key) => {
  if (!process.env[key]) {
    console.log('---------------------------------------------------------------');
    console.log(`[ERROR]:Environment variable ${key} must be configured`);
    console.log('---------------------------------------------------------------');
    process.exit(1);
  }
});*/

const MAILCHIMP_API = process.env.MAILCHIMP_API;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || "us3";
const FROM_NAME = process.env.MAILCHIMP_FROM_NAME;
const REPLY_TO = process.env.MAILCHIMP_REPLY_TO;
const LIST_ID = process.env.MAILCHIMP_LIST_ID;
const INTEREST_CATEGORY_ID = process.env.MAILCHIMP_INTEREST_CATEGORY_ID;
const KIND_CATEGORY_ID = process.env.MAILCHIMP_KIND_CATEGORY_ID;

const DECISION_STRINGS = ['Ik ontvang enkel beslissingen', 'Ik ontvang zowel persberichten als beslissingen'];

class Mailchimp {
  constructor() {
    mailchimpConnection.setConfig(
      {
        apiKey: `${MAILCHIMP_API}`,
        server: `${MAILCHIMP_SERVER}`
      });
  }

  async createTemplate(agendaInformationForNewsLetter) {
    console.log(`Creating Mailchimp template...`);

    const {
      mailTitle,
      htmlContent,
      formattedStart,
      formattedDocumentDate,
      procedureText,
      kindOfMeeting
    } = agendaInformationForNewsLetter;

    const html = await createNewsLetter(htmlContent, formattedStart, formattedDocumentDate, procedureText, kindOfMeeting);

    const template = {
      name: mailTitle,
      html: html
    }
    const templateResponse = await mailchimpConnection.templates.create(template);

    const templateId = templateResponse['id']

    console.log(`templateResponse template id: ${templateId}`);
    return templateId;
  }

  async createNewCampaign(templateId, agendaInformationForNewsLetter) {

    const { mailSubjectPrefix, mailTitle } = agendaInformationForNewsLetter;

    const themeCondition = await this.createThemesCondition(pressReleaseData.themes);  // allThemesOfNewsletter
    const kindCondition = await this.createKindCondition();

    const campaign = {
      type: "regular",
      recipients: {
        list_id: LIST_ID,
        segment_opts: {
          match: 'all',
          conditions: [themeCondition, kindCondition]
        }
      },
      settings: {
        subject_line: `${mailSubjectPrefix}: ${mailTitle}`,
        preview_text: `${mailSubjectPrefix}: ${mailTitle}`,
        title: `${mailSubjectPrefix}: ${mailTitle}`,
        from_name: FROM_NAME,
        reply_to: REPLY_TO,
        inline_css: true,
        template_id: templateId,
      }
    }
    const campaignResponse = await mailchimpConnection.campaigns.create(campaign)

    console.log(`campaignResponse campaign id: ${campaignResponse['id']}`);

    return {
      campaignId: campaignResponse['id'],
      webId: campaignResponse['web_id'],
      archiveUrl: campaignResponse['archive_url']
    };
  }

  async sendCampaign(campaignId) {
    await mailchimpConnection.campaigns.send(campaignId);
  }

  async deleteCampaign(campaignId) {
    console.log(`Deleting Mailchimp campaign ${campaignId}...`);

    // TODO is this necessary? For press releases the delete was done right after sending
    // in which case a retry could be necessary. In this case there is more time between
    // sending and deleting
    await this.retryDeleteCampaign(campaignId, 4, 2000);

    console.log(`Deleting Mailchimp campaign ${campaignId} DONE`);
  }

  async retryDeleteCampaign(campaignId, numberOfTries, timeout) {
    console.log(numberOfTries);
    if (numberOfTries <= 0) {
      console.log(`Could not delete Mailchimp campaign ${campaignId}`);
      return;
    }
    try {
      const result = await mailchimpConnection.campaigns.remove(campaignId);

      if (result && result.status === 200) {
        return result;
      }
    }
    catch (error) {
      await this.wait(timeout);
      return this.retryDeleteCampaign(campaignId, numberOfTries - 1, timeout);
    }
  }

  async createThemesCondition (allThemesOfNewsletter) {
    const allUniqueThemesOfNewsletter = [...new Set(allThemesOfNewsletter)];
    const interests = await fetchInterestsByIdFromLists(INTEREST_CATEGORY_ID);
    const interestMapping = interests.filter((theme) => {
      if (allUniqueThemesOfNewsletter.includes(theme.name)) {
        return theme;
      }
    });
    return {
      condition_type: 'Interests',
      field: `interests-${INTEREST_CATEGORY_ID}`,
      op: 'interestcontains',
      value: interestMapping.map((item) => item.id)
    };
  };

  async createKindCondition () {
    const interestedKinds = await fetchInterestsByIdFromLists(KIND_CATEGORY_ID);
    const interestKindMapping = interestedKinds.filter((interest) => {
      if (DECISION_STRINGS.includes(interest.name)) {
        return interest;
      }
    });
    return {
      condition_type: 'Interests',
      field: `interests-${KIND_CATEGORY_ID}`,
      op: 'interestcontains',
      value: interestKindMapping.map((item) => item.id)
    };
  };

  /**
   * This function fetches all interests from the mailchimp API
   * By defined LIST_ID and INTEREST_CATEGORY_ID we create a possibility to
   * use the same code for all environments based on these defined env-variables.
   * Returns [{id: string, name: string}]
   * optional parameter ?count:integer default:100
   */
  async fetchInterestsByIdFromLists (category_id, count = 100) {
    const interests = await mailchimp.get({
      path: `lists/${LIST_ID}/interest-categories/${category_id}/interests?count=${count}`
    });
    return interests.interests;
  };
}

const mailchimp = new Mailchimp();

export async function prepareCampaign(agendaInformationForNewsLetter) {
  console.log("Prepairing new campaign in Mailchimp...");

  await mailchimp.ping();

  const mailTitle = `beslissingen van ${agendaInformationForNewsLetter.formattedStart}`;
  const htmlContent = getNewsItemsHtml(agendaInformationForNewsLetter.agendaURI);

 /* agendaInformationForNewsLetter = {
    mailTitle: mailTitle,
    htmlContent: htmlContent,
    ...agendaInformationForNewsLetter,
  }*/

  const templateId = await mailchimp.createTemplate(agendaInformationForNewsLetter);
  const campaign = await mailchimp.createNewCampaign(templateId, agendaInformationForNewsLetter);

  await mailchimp.deleteTemplate(templateId);

  return campaign;
}

export async function sendCampaign(campaignId) {
  console.log(`Sending campaign ${campaignId} in Mailchimp...`);

 await mailchimp.sendCampaign(campaignId);
}

export async function deleteCampaign(campaignId) {
  console.log(`Deleting campaign ${campaignId} in Mailchimp...`);

  await mailchimp.deleteCampaign(campaignId);
}

