const router = require('express').Router();

router.use('/call-status', require('./call-status'));
router.use('/siprec-transcribe', require('./siprec-transcribe'));

module.exports = router;
