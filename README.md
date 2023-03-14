# Newsletter service
Microservice that publishes newsletters from Kaleidos to Belga or Mailchimp.

## Getting started
### Add the service to your stack
Add the following snippet to your `docker-compose.yml`:
```yml
  newsletter-service:
    image: kanselarij/newsletter-service
    volumes:
      - ./data/generated-xmls:/data
    logging: *default-logging
    restart: always
    labels:
      - "logging=true"
```
## Reference
### Configuration

The following environment variables have to be configured:

| Key                            | type   | description                                                  |
|--------------------------------|--------|--------------------------------------------------------------|
| MAILCHIMP_API                  | string | api key to connect to mailchimp                              |
| MAILCHIMP_REPLY_TO             | string | mail address to be used as sender address                    |
| MAILCHIMP_FROM_NAME            | string | name to be used as sender details (should be validated domain, to be set on the mailchimp interface)                             |
| MAILCHIMP_LIST_ID              | string | the list containing the subscribers                          |
| MAILCHIMP_INTEREST_CATEGORY_ID | string | the list of interest categories (themes) linked to the list  |
| MAILCHIMP_KIND_CATEGORY_ID     | string | the list of kind categories linked to the list               |
| MAILCHIMP_SERVER               | string | the Mailchimp server to connect to. Default value 'us3'      |
| BELGA_FTP_USERNAME             | string | the username to login to the Belga server                    |
| BELGA_FTP_PASSWORD             | string | the password to login to the Belga server                    |
| BELGA_FTP_HOST                 | string | the Belga server to connect to. Default value 'ftp.belga.be' |
| XML_STORAGE_PATH               | string | storage location of Belga xmls. Default value '/data'       |

The service will fail if the environment variables are not defined properly.

### API

#### POST /mail-campaigns

Create the mail campaign in Mailchimp and create a corresponding mail-campaign resource in the triplestore.

Example request body:
```javascript
{
  "data": {
    "relationships": {
      "meeting": {
        "data": {
          "id": "8648c98f-fce0-444a-a7c9-0c63156f869c"
        }
      }
    }
  }
}
```

Example response body:

``` javascript
{
  "data": {
    "type": "mail-campaigns",
    "id": "newly-generated-uuid",
    "attributes": {
      "web-id": 123456,
      "archive-url": "http://archive-url",
      "campaign-id": "campaign-id-from-mailchimp"
    }
  }
}
```

#### POST /mail-campaigns/:id/send

Send out the campaign to Mailchimp and set the sent-time in the database.

_Note: this request expects Mailchimp's campaignId to be passed as ID, not the resource's UUID._

_Note: this request will fail if no mails are sent (e.g. no subscribers for the selected theme)_

#### GET /mail-campaigns/:id

Get details of the given mail campaign.

Optionally `fields['mail-campaigns']=html` can be passed as query param to get the HTML content of the mail campaign.

_Note: this request expects Mailchimp's campaignId to be passed as ID, not the resource's UUID._

Example response body:

``` javascript
// If fields['mail-campaigns']=html is set as query param
{
  "data": {
    "type": "mail-campaigns",
    "id": "campaign-id-from-mailchimp",
    "attributes": {
      "html": "<p>The full html content goes here</p>"
    }
  }
}
// If fields['mail-campaigns']=html is NOT set as query param
{
  "data": {
    "type": "mail-campaigns",
    "id": "campaign-id-from-mailchimp",
    "attributes": {
      "create-time": "2023-03-14T10:00:00Z"
      "web-id": 123456,
      "archive-url": "http://archive-url",
    }
  }
}
```

#### DELETE /mail-campaigns/:id

Delete a mail-campaign in Mailchimp and from the database.

_Note: this request expects Mailchimp's campaignId to be passed as ID, not the resource's UUID._

#### POST /belga-newsletters

Send a newsletter to the Belga server

Example request body:
```javascript
{
  "data": {
    "relationships": {
      "meeting": {
        "data": {
          "id": "8648c98f-fce0-444a-a7c9-0c63156f869c"
        }
      }
    }
  }
}
```

#### GET /belga-newsletters/:id/download

Download the XML file that is used to send to Belga
