// Middleware: verify user has sufficient credits before triggering a call
const db = require('../services/supabase');

async function checkCredits(req, res, next) {
  try {
    const { data: user } = await db.from('users').select('credit_balance').eq('id', req.user.id).single();
    if (!user || user.credit_balance < 2) {
      return res.status(402).json({ error: 'Insufficient credits. Please top up your balance.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { checkCredits };
