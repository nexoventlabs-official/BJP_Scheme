const express = require('express');
const router = express.Router();
const { searchEpic, confirmVoterRegistration } = require('../controllers/voterController');

router.post('/search-epic', searchEpic);
router.post('/confirm-registration', confirmVoterRegistration);

module.exports = router;
