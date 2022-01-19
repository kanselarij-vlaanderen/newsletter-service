# Newsletter service
Microservice that publishes newsletters from Kaleidos to Belga or Mailchimp.

## Getting started
### Add the service to your stack
Add the following snippet to your `docker-compose.yml`:
```yml
  newsletter-service:
    image: kanselarij/newsletter-service:2.5.0
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
| MAILCHIMP_FROM_NAME            | string | name to be used as sender details                            |
| MAILCHIMP_LIST_ID              | string | the list containing the subscribers                          |
| MAILCHIMP_INTEREST_CATEGORY_ID | string | the list of interest categories (themes) linked to the list  |
| MAILCHIMP_KIND_CATEGORY_ID     | string | the list of kind categories linked to the list               |
| BELGA_FTP_USERNAME             | string | the username to login to the Belga server                    |
| BELGA_FTP_PASSWORD             | string | the password to login to the Belga server                    |
| BELGA_FTP_HOST                 | string | the Belga server to connect to. Default value 'ftp.belga.be' |

### API

####POST /mail-campaigns

Create the mail campaign in Mailchimp

Example request body:
```javascript
{
  "data": {
    "meetingId": "1"
  }
}
```
####POST /mail-campaigns/:id/send
Send out the campaign to Mailchimp
####GET /mail-campaigns/:id
Gets the create time of a mail campaign
####GET /mail-campaigns/:id/content
Gets the HTML of a mail campaign
####DELETE /mail-campaigns/:id
Delete a mail-campaign

####POST /belga-newsletters
Sends a newsletter to the Belga server

Example request body:
```javascript
{
  "data": {
    "meetingId": "1"
  }
}
```

####GET /belga-newsletters/:id
Downloads the XML file that's used to send to Belga
