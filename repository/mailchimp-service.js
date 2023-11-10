import mailchimpConnection from '@mailchimp/mailchimp_marketing';
import { getNewsItemInfo } from '../util/query-helper';
import { createNewsLetter } from '../util/html';

const MAILCHIMP_API = process.env.MAILCHIMP_API;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || "us3";
const FROM_NAME = process.env.MAILCHIMP_FROM_NAME;
const REPLY_TO = process.env.MAILCHIMP_REPLY_TO;
const LIST_ID = process.env.MAILCHIMP_LIST_ID;
const INTEREST_CATEGORY_ID = process.env.MAILCHIMP_INTEREST_CATEGORY_ID;
// const KIND_CATEGORY_ID = process.env.MAILCHIMP_KIND_CATEGORY_ID;

const DECISION_STRINGS = ['Ik ontvang enkel beslissingen', 'Ik ontvang zowel persberichten als beslissingen'];

export default class MailchimpService {

  constructor() {
    mailchimpConnection.setConfig(
      {
        apiKey: `${MAILCHIMP_API}`,
        server: `${MAILCHIMP_SERVER}`
      });
  }

  async wait(durationInMs) {
    return new Promise(resolve => setTimeout(resolve, durationInMs));
  }

  async ping() {
    const response = await mailchimpConnection.ping.get();

    if (response.health_status) {
      console.log("The Mailchimp connection is working correctly.")
    } else {
      console.log("Could not connect to Mailchimp.", response);
      throw (response);
    }
  }

  async prepareCampaign(agendaInformationForNewsLetter) {
    console.log("Preparing new campaign in Mailchimp...");

    await this.ping();

    const mailTitle = `beslissingen van ${agendaInformationForNewsLetter.formattedStart}`;
    const newsItemInfo = await getNewsItemInfo(agendaInformationForNewsLetter.agendaURI);

    agendaInformationForNewsLetter = {
      mailTitle: mailTitle,
      htmlContent: newsItemInfo.htmlContent,
      ...agendaInformationForNewsLetter
    }

    const templateId = await this.createTemplate(agendaInformationForNewsLetter);

    const campaign = await this.createNewCampaign(templateId, agendaInformationForNewsLetter, newsItemInfo.newsletterThemes);

    await this.deleteTemplate(templateId);

    return campaign;
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
    console.log('Template Mailchimp created');

    const templateId = templateResponse['id']

    return templateId;
  }

  async createNewCampaign(templateId, agendaInformationForNewsLetter, newsletterThemes) {
    console.log(`Creating Mailchimp campaign...`);
    const { mailSubjectPrefix, mailTitle } = agendaInformationForNewsLetter;

    const themeCondition = await this.createThemesCondition(newsletterThemes);
    // const kindCondition = await this.createKindCondition(); // TODO GONE ON PROD!!

    const campaign = {
      type: "regular",
      recipients: {
        list_id: LIST_ID,
        segment_opts: {
          match: 'all',
          conditions: [themeCondition]
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
    const campaignResponse = await mailchimpConnection.campaigns.create(campaign);
    console.log('Campaign Mailchimp created');

    console.log(`campaignResponse campaign id: ${campaignResponse['id']}`);

    return {
      campaignId: campaignResponse['id'],
      web_id: campaignResponse['web_id'],
      archive_url: campaignResponse['archive_url'],
      create_time: campaignResponse['create_time']
    };
  }

  async sendCampaign(campaignId) {
    console.log(`Sending campaign ${campaignId} in Mailchimp...`);

    await mailchimpConnection.campaigns.send(campaignId);

    console.log(`Sending campaign ${campaignId} in Mailchimp DONE`);
  }

  async deleteTemplate(templateId) {
    console.log(`Deleting Mailchimp template ${templateId}...`);

    await mailchimpConnection.templates.deleteTemplate(templateId);

    console.log(`Deleting Mailchimp template ${templateId} DONE`);

  }

  async deleteCampaign(campaignId) {
    console.log(`Deleting Mailchimp campaign ${campaignId}...`);

    // delete action is blocked by Mailchimp if the campaign is still sending
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

  async createThemesCondition (newsletterThemes) {
    console.log('Fetching theme interests');
    const uniqueNewsletterThemes = [...new Set(newsletterThemes)];
    const interests = await this.fetchInterestsByCategoryIdFromLists(INTEREST_CATEGORY_ID);
    console.log('Done fetching theme interests');
    const interestMapping = interests.filter((theme) => {
      if (uniqueNewsletterThemes.includes(theme.name)) {
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

  // TODO removed kind interest on prod
  // async createKindCondition () {
  //   const interestedKinds = await this.fetchInterestsByCategoryIdFromLists(KIND_CATEGORY_ID);
  //   const interestKindMapping = interestedKinds.filter((interest) => {
  //     if (DECISION_STRINGS.includes(interest.name)) {
  //       return interest;
  //     }
  //   });
  //   return {
  //     condition_type: 'Interests',
  //     field: `interests-${KIND_CATEGORY_ID}`,
  //     op: 'interestcontains',
  //     value: interestKindMapping.map((item) => item.id)
  //   };
  // };

  /**
   * This function fetches all interests from the mailchimp API
   * By defined LIST_ID and INTEREST_CATEGORY_ID we create a possibility to
   * use the same code for all environments based on these defined env-variables.
   * Returns [{id: string, name: string}]
   * optional parameter ?count:integer default:100
   */
   async fetchInterestsByCategoryIdFromLists(categoryId) {
    const interestsResponse = await mailchimpConnection.lists.listInterestCategoryInterests(LIST_ID, categoryId, {count: 100})

    return interestsResponse.interests;
  }

  async getCampaignData(campaignId) {
    console.log(`Get campaign data for campaign ${campaignId}`);
    return await mailchimpConnection.campaigns.get(campaignId);
  }

  async getCampaignContent(campaignId) {
    console.log(`Get campaign content for campaign ${campaignId}`);
    return await mailchimpConnection.campaigns.getContent(campaignId);
  }
}

