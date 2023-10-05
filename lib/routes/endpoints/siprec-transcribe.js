const router = require('express').Router();
const WebhookResponse = require('@jambonz/node-client').WebhookResponse;
const axios = require('axios');
const {parseSiprecPayload} = require('../../utils');
const baseUrl = 'http://webhook.site';
const urlToken = 'b41f9ce76b216a1487c49ab805b959c95ee7dbc439bce4c2a58c80389f4c9ee';

router.post('/', async(req, res) => {
  const {logger} = req.app.locals;
  logger.debug({payload: req.body}, 'POST /transcribe');

  try {
    const obj = await parseSiprecPayload(logger, req);
    logger.debug({obj}, 'parsed SIPREC payload');

    const app = new WebhookResponse();
    app
      .tag({
        data: {
          from: obj.caller?.number,
          to: obj.callee?.number,
          agentId: req.body.sip.headers['X-GenesysAgentID'],
          conversationId: req.body.sip.headers['X-GenesysConversationID']
        }
      })
      .transcribe({
        transcriptionHook: '/siprec-transcribe/transcription',
        recognizer: {
          vendor: 'google',
          language: 'en-US',
          separateRecognitionPerChannel: true,
          interim: true
        }
      });
    res.status(200).json(app);
  } catch (err) {
    logger.error({err}, 'Error');
    res.sendStatus(503);
  }
});

router.post('/transcription', (req, res) => {
  const {logger} = req.app.locals;
  const payload = req.body;
  const {speech, call_sid} = payload;
  const {language_code, is_final} = speech;

  const {agent_id, conversation_id, from, to} = payload.customerdata;
  logger.debug({payload: req.body},
    `final transcription for agent_id ${agent_id} and conversation_id ${conversation_id}`);
  res.sendStatus(200);

  // DCH: TMP discard agent transcript
  if (speech.channel === 1) return;
  if (speech.alternatives.length && speech.alternatives[0].transcript) {
    const text = speech.alternatives[0].transcript;
    const confidence = speech.alternatives[0].confidence;
    const payload = {
      userId: from.replace('+', ''),
      URLToken: urlToken,
      sessionId: call_sid,
      text,
      data: {
        callerId : from,
        calledNumber: to,
        conversationId : conversation_id,
        agentId: agent_id,
        finalMessage: is_final,
        channel: speech.channel,
        ...(confidence && {confidence}),
        ...(language_code && {language: language_code})
      },
    };
    logger.info({payload}, `injecting ${text}`);
    axios({
      method: 'POST',
      url: `/${urlToken}`,
      baseURL: baseUrl,
      data: payload
    })
      .then((response) => {
        if (response.status !== 202) logger.info({data: response.data}, `got response ${response.status}`);
        return;
      })
      .catch((err) => {
        logger.info({err}, 'Error');
      });
  }
});

router.post('/partial-transcription', (req, res) => {
  const {logger} = req.app.locals;
  const payload = req.body;
  const {agent_id, conversation_id} = payload.customerdata;
  logger.debug({payload: req.body},
    `interim transcription for agent_id ${agent_id} and conversation_id ${conversation_id}`);
  res.sendStatus(200);
});

module.exports = router;

