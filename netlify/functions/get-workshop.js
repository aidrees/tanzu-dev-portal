/* eslint-disable no-console */
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const got = require('got');
const Sentry = require('@sentry/serverless');
const { getSiteURL } = require('./util/auth');
const { config } = require('./util/config');

const baseURL = process.env.LOOKUP_SERVICE_URL;
const apiKey = process.env.LOOKUP_SERVICE_API_KEY;


Sentry.AWSLambda.init({
    dsn: process.env.SENTRY_DSN_GET_WORKSHOP,
    environment: config.context,
    tracesSampleRate: 1.0,
});

exports.handler = Sentry.AWSLambda.wrapHandler(async (event) => {
    if (event.path.endsWith('/get-workshop') || event.path.endsWith('/get-workshop/')) {
        console.error('Missing workshop');
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'No Workshop' }),
        };
    }
    const ws = event.path.replace('/developer/get-workshop/', '');
    const cookies = cookie.parse(event.headers.cookie);
    const decodedToken = jwt.decode(cookies.nf_jwt);

    try {
        const remoteUrl = `${baseURL}/${ws}`;
        console.log("Useing remoteUrl: %s", remoteUrl);
        const availability = await got.get(remoteUrl, {
            headers: {
                Authorization: `Api-Key ${apiKey}`,
                'Content-Type': undefined,
            },
        });
        console.log("Availability statusCode: %d", availability.statusCode);
        if (availability.statusCode !== 200 || availability.body.error) {
            throw new Error(
                availability.body.error ||
          'Oops. Something went wrong! Try again please.',
            );
        }
        let redirectURL = '';
        console.log("src: %s", event.queryStringParameters.src);
        if (event.queryStringParameters.src) {
            const { src } = event.queryStringParameters;
            redirectURL = src;
        } else {
            redirectURL = event.headers.referer.replace(/$/, '');
        }
        redirectURL = redirectURL.replace(/\?ws_status=unavailable/, '');
        const jsonavailbody = JSON.parse(availability.body);
        console.log("Availability Body: %s", jsonavailbody);
        if (jsonavailbody.available === 0) {
            return {
                statusCode: 302,
                headers: {
                    Location: `${redirectURL}?ws_status=unavailable`,
                    'Cache-Control': 'no-cache',
                },
                body: '',
            };
        }
        const { body, statusCode } = await got.post(remoteUrl, {
            headers: { Authorization: `Api-Key ${apiKey}` },
            json: { refer: `${getSiteURL()}/developer/workshops`, user: decodedToken.id },
        });
        if (statusCode !== 200 || body.error) {
            throw new Error(
                body.error || 'Oops. Something went wrong! Try again please.',
            );
        }
        const jsonbody = JSON.parse(body);
        const encodedUrl = Buffer.from(jsonbody.url)
            .toString('base64')
            .replace('+', '-')
            .replace('/', '_')
            .replace(/=+$/, '');
        const redirectedUrl = `${getSiteURL()}/developer/workshop-live?ws=${encodedUrl}`;
        return {
            statusCode: 302,
            headers: {
                Location: redirectedUrl,
                'Cache-Control': 'no-cache',
            },
            body: '',
        };
    } catch (err) {
        console.error(err.message);
        return {
            statusCode: err.statusCode || 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
});
