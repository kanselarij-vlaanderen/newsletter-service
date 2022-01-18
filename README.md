# Newsletter service
Microservice that publishes newsletters from Kaleidos to Belga or Mailchimp.

## Getting started
### Add the service to your stack
Add the following snippet to your `docker-compose.yml`:
```yml
  newsletter-service:
    environment:
      NODE_ENV: 
      MAILCHIMP_API: 
      MAILCHIMP_REPLY_TO: 
      MAILCHIMP_FROM_NAME: 
      MAILCHIMP_LIST_ID: 
      MAILCHIMP_INTEREST_CATEGORY_ID: 
      MAILCHIMP_KIND_CATEGORY_ID: 
      BELGA_FTP_USERNAME: 
      BELGA_FTP_PASSWORD: 
      BELGA_FTP_HOST: "ftp.belga.be"
    volumes:
      - ../newsletter-service/:/app
    image: semtech/mu-javascript-template:1.3.5
```

### API


