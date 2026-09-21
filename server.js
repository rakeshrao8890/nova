require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore =
  require('connect-mongo').default || require('connect-mongo');

const app = express();

const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =====================================================
// ENVIRONMENT
// =====================================================

const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  'CHANGE_THIS_SESSION_SECRET';

const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || '';

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || '';

if (!MONGO_URI) {
  console.error(
    'ERROR: MONGODB_URI / MONGO_URI is missing.'
  );
  process.exit(1);
}

// =====================================================
// APP URL
// =====================================================

const APP_URL =
  (process.env.APP_URL || '').replace(/\/+$/, '');

// =====================================================
// RS PAYMENT CONFIG
// =====================================================

const RSPAY_MERCHANT_ID =
  process.env.RSPAY_MERCHANT_ID || '';

const RSPAY_ACCESS_KEY =
  process.env.RSPAY_ACCESS_KEY || '';

const RSPAY_API_URL =
  process.env.RSPAY_API_URL ||
  'https://rspayment.shop/api.php';

const RSPAY_WITHDRAW_URL =
  process.env.RSPAY_WITHDRAW_URL ||
  'https://rspayment.shop/withdraw_api.php';

const RSPAY_WEBHOOK_URL =
  process.env.RSPAY_WEBHOOK_URL ||
  (APP_URL
    ? `${APP_URL}/api/payment/webhook`
    : '');

const RSPAY_RETURN_URL =
  process.env.RSPAY_RETURN_URL ||
  (APP_URL
    ? `${APP_URL}/payment-success.html`
    : '');

// =====================================================
// WATCHPAYS CONFIG
// =====================================================

const WATCHPAYS_MERCHANT_ID =
  process.env.WATCHPAYS_MERCHANT_ID || '';

const WATCHPAYS_API_KEY =
  process.env.WATCHPAYS_API_KEY || '';

const WATCHPAYS_PAYOUT_KEY =
  process.env.WATCHPAYS_PAYOUT_KEY || '';

const WATCHPAYS_PAYIN_URL =
  process.env.WATCHPAYS_PAYIN_URL ||
  'https://api.watchpays.com/v1/create';

const WATCHPAYS_PAYOUT_URL =
  process.env.WATCHPAYS_PAYOUT_URL ||
  'http://api.watchpays.com/payout/payment';

const WATCHPAYS_PAYIN_CALLBACK =
  process.env.WATCHPAYS_PAYIN_CALLBACK ||
  (APP_URL
    ? `${APP_URL}/api/watchpays/callback`
    : '');

const WATCHPAYS_PAYOUT_CALLBACK =
  process.env.WATCHPAYS_PAYOUT_CALLBACK ||
  (APP_URL
    ? `${APP_URL}/api/watchpays/payout-callback`
    : '');

// =====================================================
// SCHEMAS
// =====================================================

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },

    salt: {
      type: String,
      required: true
    },

    password_hash: {
      type: String,
      required: true
    },

    referral_code: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    referred_by: {
      type: String,
      default: null,
      index: true
    },

    banned: {
      type: Boolean,
      default: false,
      index: true
    },

    vip_level: {
      type: Number,
      default: 0
    },

    created_at: {
      type: Date,
      default: Date.now
    },

    last_activity_at: {
      type: Date,
      default: Date.now
    }
  }
);

const walletSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  balance: {
    type: Number,
    default: 0
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
});

const walletTransactionSchema =
  new mongoose.Schema({
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    type: {
      type: String,
      required: true,
      enum: [
        'credit',
        'debit',
        'refund'
      ]
    },

    amount: {
      type: Number,
      required: true
    },

    balance_after: {
      type: Number,
      required: true
    },

    reference_type: {
      type: String,
      default: null
    },

    reference_id: {
      type: String,
      default: null
    },

    created_at: {
      type: Date,
      default: Date.now
    }
  });

walletTransactionSchema.index(
  {
    reference_type: 1,
    reference_id: 1,
    type: 1
  },
  {
    unique: true,
    sparse: true
  }
);

const paymentSchema =
  new mongoose.Schema({
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    plan: {
      type: String,
      default: null
    },

    amount: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: 'INR'
    },

    merchant_order_id: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    platform_order_id: {
      type: String,
      default: null
    },

    pay_url: {
      type: String,
      default: null
    },

    gateway: {
      type: String,
      default: 'RSPAY'
    },

    status: {
      type: String,
      default: 'created',
      index: true
    },

    created_at: {
      type: Date,
      default: Date.now
    },

    paid_at: {
      type: Date,
      default: null
    }
  });

const withdrawalSchema =
  new mongoose.Schema({
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    amount: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: 'INR'
    },

    method: {
      type: String,
      default: 'BANK'
    },

    upi_id: {
      type: String,
      default: null
    },

    account_name: {
      type: String,
      default: null
    },

    account_number: {
      type: String,
      default: null
    },

    account_last4: {
      type: String,
      default: null
    },

    bank_name: {
      type: String,
      default: null
    },

    ifsc: {
      type: String,
      default: null
    },

    gateway: {
      type: String,
      default: null
    },

    gateway_transaction_id: {
      type: String,
      default: null
    },

    gateway_fee: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      default: 'pending',
      index: true
    },

    created_at: {
      type: Date,
      default: Date.now
    },

    processed_at: {
      type: Date,
      default: null
    }
  });

const planSchema =
  new mongoose.Schema({
    name: {
      type: String,
      required: true
    },

    amount: {
      type: Number,
      required: true
    },

    duration_days: {
      type: Number,
      default: 0
    },

    daily_return: {
      type: Number,
      default: 0
    },

    total_return: {
      type: Number,
      default: 0
    },

    active: {
      type: Boolean,
      default: true
    },

    created_at: {
      type: Date,
      default: Date.now
    }
  });

const investmentSchema =
  new mongoose.Schema({
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    plan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      default: null
    },

    plan_name: {
      type: String,
      default: null
    },

    amount: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      default: 'active'
    },

    started_at: {
      type: Date,
      default: Date.now
    },

    expires_at: {
      type: Date,
      default: null
    }
  });

const notificationSchema =
  new mongoose.Schema({
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    title: {
      type: String,
      default: ''
    },

    message: {
      type: String,
      default: ''
    },

    read: {
      type: Boolean,
      default: false
    },

    created_at: {
      type: Date,
      default: Date.now
    }
  });

const platformSettingsSchema =
  new mongoose.Schema({
    key: {
      type: String,
      unique: true,
      required: true
    },

    value: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    updated_at: {
      type: Date,
      default: Date.now
    }
  });

const adminActivitySchema =
  new mongoose.Schema({
    action: {
      type: String,
      required: true
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    created_at: {
      type: Date,
      default: Date.now
    }
  });

const User =
  mongoose.models.User ||
  mongoose.model('User', userSchema);

const Wallet =
  mongoose.models.Wallet ||
  mongoose.model('Wallet', walletSchema);

const WalletTransaction =
  mongoose.models.WalletTransaction ||
  mongoose.model(
    'WalletTransaction',
    walletTransactionSchema
  );

const Payment =
  mongoose.models.Payment ||
  mongoose.model(
    'Payment',
    paymentSchema
  );

const Withdrawal =
  mongoose.models.Withdrawal ||
  mongoose.model(
    'Withdrawal',
    withdrawalSchema
  );

const Plan =
  mongoose.models.Plan ||
  mongoose.model(
    'Plan',
    planSchema
  );

const Investment =
  mongoose.models.Investment ||
  mongoose.model(
    'Investment',
    investmentSchema
  );

const Notification =
  mongoose.models.Notification ||
  mongoose.model(
    'Notification',
    notificationSchema
  );

const PlatformSettings =
  mongoose.models.PlatformSettings ||
  mongoose.model(
    'PlatformSettings',
    platformSettingsSchema
  );

const AdminActivity =
  mongoose.models.AdminActivity ||
  mongoose.model(
    'AdminActivity',
    adminActivitySchema
  );

// =====================================================
// HELPERS
// =====================================================

function createSalt() {
  return crypto
    .randomBytes(16)
    .toString('hex');
}

function hashPassword(
  password,
  salt
) {
  return crypto
    .scryptSync(
      String(password),
      salt,
      64
    )
    .toString('hex');
}

function verifyPassword(
  password,
  salt,
  passwordHash
) {
  try {
    const hash =
      hashPassword(
        password,
        salt
      );

    const a =
      Buffer.from(hash, 'hex');

    const b =
      Buffer.from(passwordHash, 'hex');

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      a,
      b
    );
  } catch {
    return false;
  }
}

function makeRef(prefix = 'NV') {
  return (
    prefix +
    '_' +
    Date.now() +
    '_' +
    crypto
      .randomBytes(5)
      .toString('hex')
  );
}

function moneyToPaise(amount) {
  return Math.round(
    Number(amount) * 100
  );
}

function paiseToMoney(amount) {
  return Number(amount || 0) / 100;
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    referral_code:
      user.referral_code,
    referred_by:
      user.referred_by,
    vip_level:
      user.vip_level || 0,
    banned:
      user.banned === true,
    created_at:
      user.created_at
  };
}

async function ensureWallet(
  userId,
  mongoSession = null
) {
  let wallet =
    await Wallet.findOne({
      user_id: userId
    }).session(mongoSession);

  if (!wallet) {
    const created =
      await Wallet.create(
        [
          {
            user_id: userId,
            balance: 0,
            updated_at: new Date()
          }
        ],
        mongoSession
          ? { session: mongoSession }
          : undefined
      );

    wallet = created[0];
  }

  return wallet;
}

function admin(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.status(401).json({
      success: false,
      message:
        'Admin login required.'
    });
  }

  next();
}

async function login(
  req,
  res,
  next
) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({
        success: false,
        message:
          'Login required.'
      });
    }

    const user =
      await User.findById(
        req.session.userId
      );

    if (!user) {
      req.session.destroy(() => {});

      return res.status(401).json({
        success: false,
        message:
          'User account not found.'
      });
    }

    if (user.banned) {
      req.session.destroy(() => {});

      return res.status(403).json({
        success: false,
        message:
          'Your account has been banned.'
      });
    }

    user.last_activity_at =
      new Date();

    await user.save();

    req.currentUser = user;

    next();
  } catch (error) {
    console.error(
      'Login middleware error:',
      error
    );

    res.status(500).json({
      success: false,
      message:
        'Authentication error.'
    });
  }
}

// =====================================================
// WATCHPAYS SIGNATURE - PAYIN
// =====================================================

function watchPayinSignature({
  merchant_id,
  amount,
  merchant_order_no,
  callback_url
}) {
  const values = {
    amount:
      Number(amount).toFixed(2),

    callback_url:
      callback_url,

    merchant_id:
      merchant_id,

    merchant_order_no:
      merchant_order_no
  };

  const query =
    Object.keys(values)
      .sort()
      .filter(
        key =>
          values[key] !== undefined &&
          values[key] !== null &&
          values[key] !== ''
      )
      .map(
        key =>
          `${key}=${values[key]}`
      )
      .join('&');

  return crypto
    .createHash('md5')
    .update(
      `${query}&key=${WATCHPAYS_API_KEY}`
    )
    .digest('hex');
}

// =====================================================
// WATCHPAYS SIGNATURE - PAYOUT
// =====================================================

function watchPayoutSignature({
  merchant_id,
  amount,
  transaction_id,
  account_number,
  ifsc,
  name,
  bank_name,
  callback_url
}) {
  const values = {
    account_number,
    amount:
      Number(amount).toFixed(2),
    bank_name,
    callback_url,
    ifsc,
    merchant_id,
    name,
    transaction_id
  };

  const sorted =
    Object.keys(values)
      .sort()
      .map(
        key =>
          String(values[key] ?? '')
      )
      .join('');

  return crypto
    .createHash('md5')
    .update(
      sorted +
      WATCHPAYS_PAYOUT_KEY
    )
    .digest('hex');
}

// =====================================================
// SESSION
// =====================================================

const isProduction =
  process.env.NODE_ENV === 'production';

app.use(
  session({
    name: 'nove.sid',

    secret: SESSION_SECRET,

    resave: false,

    saveUninitialized: false,

    proxy: true,

    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      collectionName: 'sessions',
      ttl:
        14 * 24 * 60 * 60
    }),

    cookie: {
      httpOnly: true,

      secure: isProduction,

      sameSite:
        isProduction
          ? 'none'
          : 'lax',

      maxAge:
        14 *
        24 *
        60 *
        60 *
        1000
    }
  })
);

// =====================================================
// HOME PROTECTION
// =====================================================

app.get(
  '/home.html',
  (req, res, next) => {
    if (
      !req.session?.userId
    ) {
      return res.redirect(
        '/login.html'
      );
    }

    next();
  }
);

// =====================================================
// REGISTER
// =====================================================

app.post(
  '/api/register',
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ''
        ).trim();

      const phone =
        String(
          req.body.phone || ''
        ).trim();

      const password =
        String(
          req.body.password || ''
        );

      const referral =
        String(
          req.body.referral_code ||
          req.body.referral ||
          ''
        ).trim()
        .toUpperCase();

      if (!name) {
        return res.status(400).json({
          success: false,
          message:
            'Name is required.'
        });
      }

      if (!phone) {
        return res.status(400).json({
          success: false,
          message:
            'Phone is required.'
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            'Password must be at least 6 characters.'
        });
      }

      const exists =
        await User.findOne({
          phone
        });

      if (exists) {
        return res.status(409).json({
          success: false,
          message:
            'Phone number is already registered.'
        });
      }

      const salt =
        createSalt();

      const passwordHash =
        hashPassword(
          password,
          salt
        );

      let referralCode;

      for (;;) {
        referralCode =
          crypto
            .randomBytes(4)
            .toString('hex')
            .toUpperCase();

        const existsCode =
          await User.findOne({
            referral_code:
              referralCode
          });

        if (!existsCode) break;
      }

      let referredBy = null;

      if (referral) {
        const referrer =
          await User.findOne({
            referral_code:
              referral
          });

        if (referrer) {
          referredBy =
            referrer.referral_code;
        }
      }

      const user =
        await User.create({
          name,
          phone,
          salt,
          password_hash:
            passwordHash,
          referral_code:
            referralCode,
          referred_by:
            referredBy,
          banned: false,
          vip_level: 0,
          created_at:
            new Date(),
          last_activity_at:
            new Date()
        });

      await Wallet.create({
        user_id:
          user._id,
        balance: 0,
        updated_at:
          new Date()
      });

      req.session.userId =
        user._id.toString();

      req.session.isAdmin =
        false;

      return res.json({
        success: true,
        message:
          'Registration successful.',
        user:
          safeUser(user)
      });
    } catch (error) {
      console.error(
        'Register error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Registration failed.'
      });
    }
  }
);

// =====================================================
// LOGIN
// =====================================================

app.post(
  '/api/login',
  async (req, res) => {
    try {
      const phone =
        String(
          req.body.phone || ''
        ).trim();

      const password =
        String(
          req.body.password || ''
        );

      if (!phone || !password) {
        return res.status(400).json({
          success: false,
          message:
            'Phone and password are required.'
        });
      }

      const user =
        await User.findOne({
          phone
        });

      if (!user) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid phone or password.'
        });
      }

      if (user.banned) {
        return res.status(403).json({
          success: false,
          message:
            'Your account has been banned.'
        });
      }

      if (
        !verifyPassword(
          password,
          user.salt,
          user.password_hash
        )
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid phone or password.'
        });
      }

      req.session.userId =
        user._id.toString();

      req.session.isAdmin =
        false;

      user.last_activity_at =
        new Date();

      await user.save();

      return res.json({
        success: true,
        message:
          'Login successful.',
        user:
          safeUser(user)
      });
    } catch (error) {
      console.error(
        'Login error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Login failed.'
      });
    }
  }
);

// =====================================================
// ME
// =====================================================

app.get(
  '/api/me',
  login,
  async (req, res) => {
    try {
      const wallet =
        await ensureWallet(
          req.session.userId
        );

      res.json({
        success: true,
        user:
          safeUser(
            req.currentUser
          ),
        wallet: {
          balance:
            paiseToMoney(
              wallet.balance
            ),
          balance_paise:
            wallet.balance
        }
      });
    } catch (error) {
      console.error(
        'ME error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Unable to load account.'
      });
    }
  }
);

// =====================================================
// WALLET
// =====================================================

app.get(
  '/api/wallet',
  login,
  async (req, res) => {
    try {
      const wallet =
        await ensureWallet(
          req.session.userId
        );

      res.json({
        success: true,
        balance:
          paiseToMoney(
            wallet.balance
          ),
        balance_paise:
          wallet.balance
      });
    } catch (error) {
      console.error(
        'Wallet error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Unable to load wallet.'
      });
    }
  }
);

// =====================================================
// REFERRAL
// =====================================================

app.get(
  '/api/referral',
  login,
  async (req, res) => {
    try {
      const code =
        req.currentUser
          .referral_code;

      res.json({
        success: true,

        referral_code:
          code,

        referral_link:
          `${APP_URL || ''}/register.html?ref=${encodeURIComponent(code)}`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load referral.'
      });
    }
  }
);

app.get(
  '/api/referrals',
  login,
  async (req, res) => {
    try {
      const referrals =
        await User.find({
          referred_by:
            req.currentUser
              .referral_code
        })
        .select(
          'name phone referral_code created_at'
        )
        .sort({
          created_at: -1
        })
        .lean();

      res.json({
        success: true,
        referrals
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load referrals.'
      });
    }
  }
);

// =====================================================
// RS PAY - CREATE
// =====================================================

app.post(
  '/api/payment/create-order',
  login,
  async (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      const plan =
        String(
          req.body.plan || ''
        ).trim();

      if (
        !Number.isFinite(amount) ||
        amount < 200
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Minimum deposit amount is ₹200.'
        });
      }

      if (!RSPAY_MERCHANT_ID) {
        return res.status(500).json({
          success: false,
          message:
            'RS Payment merchant ID is not configured.'
        });
      }

      const merchantOrderId =
        makeRef('NV');

      const params =
        new URLSearchParams();

      params.set(
        'amount',
        amount.toFixed(2)
      );

      params.set(
        'user_id',
        RSPAY_MERCHANT_ID
      );

      params.set(
        'order_id',
        merchantOrderId
      );

      params.set(
        'ext',
        'NOVE'
      );

      params.set(
        'webhook_url',
        RSPAY_WEBHOOK_URL
      );

      params.set(
        'return_url',
        RSPAY_RETURN_URL
      );

      const response =
        await fetch(
          `${RSPAY_API_URL}?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              Accept:
                'application/json'
            }
          }
        );

      const text =
        await response.text();

      let result;

      try {
        result =
          JSON.parse(text);
      } catch {
        return res.status(502).json({
          success: false,
          message:
            'RS Payment returned invalid response.'
        });
      }

      if (
        !response.ok ||
        !result.status ||
        !result.data?.payUrl
      ) {
        return res.status(502).json({
          success: false,
          message:
            result.message ||
            'Unable to create payment.'
        });
      }

      const payment =
        await Payment.create({
          user_id:
            req.session.userId,

          plan:
            plan || null,

          amount:
            moneyToPaise(amount),

          currency:
            'INR',

          merchant_order_id:
            result.data.merchant_order_id ||
            merchantOrderId,

          platform_order_id:
            result.data.platform_order_id ||
            null,

          pay_url:
            result.data.payUrl,

          gateway:
            'RSPAY',

          status:
            'created'
        });

      res.json({
        success: true,
        paymentId:
          payment._id,
        orderId:
          payment.merchant_order_id,
        payUrl:
          payment.pay_url,
        amount
      });
    } catch (error) {
      console.error(
        'RS Payment create error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Unable to create payment.'
      });
    }
  }
);

// =====================================================
// RS PAY WEBHOOK
// =====================================================

app.post(
  '/api/payment/webhook',
  async (req, res) => {
    try {
      const {
        status,
        user_id,
        merchant_order_id,
        amount
      } = req.body;

      if (
        String(user_id || '') !==
        String(RSPAY_MERCHANT_ID)
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Invalid merchant.'
        });
      }

      if (
        String(status || '')
          .toLowerCase() !==
        'success'
      ) {
        return res.json({
          success: true
        });
      }

      const payment =
        await Payment.findOne({
          merchant_order_id
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            'Payment not found.'
        });
      }

      if (
        payment.status === 'paid' ||
        payment.status === 'captured'
      ) {
        return res.json({
          success: true,
          message:
            'Already processed.'
        });
      }

      if (
        Math.abs(
          Number(amount) -
          paiseToMoney(
            payment.amount
          )
        ) > 0.01
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Amount mismatch.'
        });
      }

      const mongoSession =
        await mongoose.startSession();

      try {
        await mongoSession.withTransaction(
          async () => {
            const fresh =
              await Payment.findById(
                payment._id
              ).session(
                mongoSession
              );

            if (
              !fresh ||
              fresh.status === 'paid'
            ) {
              return;
            }

            const wallet =
              await ensureWallet(
                fresh.user_id,
                mongoSession
              );

            const old =
              Number(
                wallet.balance || 0
              );

            const next =
              old +
              Number(
                fresh.amount
              );

            wallet.balance =
              next;

            wallet.updated_at =
              new Date();

            await wallet.save({
              session:
                mongoSession
            });

            await WalletTransaction.create(
              [
                {
                  user_id:
                    fresh.user_id,

                  type:
                    'credit',

                  amount:
                    fresh.amount,

                  balance_after:
                    next,

                  reference_type:
                    'payment',

                  reference_id:
                    String(
                      fresh._id
                    )
                }
              ],
              {
                session:
                  mongoSession
              }
            );

            fresh.status =
              'paid';

            fresh.paid_at =
              new Date();

            await fresh.save({
              session:
                mongoSession
            });
          }
        );
      } finally {
        await mongoSession.endSession();
      }

      res.json({
        success: true
      });
    } catch (error) {
      console.error(
        'RS webhook error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Webhook processing failed.'
      });
    }
  }
);

// =====================================================
// RS PAYMENT STATUS
// =====================================================

app.get(
  '/api/payment/status/:orderId',
  login,
  async (req, res) => {
    try {
      const payment =
        await Payment.findOne({
          merchant_order_id:
            req.params.orderId,

          user_id:
            req.session.userId
        });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            'Payment not found.'
        });
      }

      res.json({
        success: true,
        status:
          payment.status,
        orderId:
          payment.merchant_order_id,
        amount:
          paiseToMoney(
            payment.amount
          ),
        paid_at:
          payment.paid_at
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to check payment.'
      });
    }
  }
);

// =====================================================
// WATCHPAYS PAY-IN CREATE
// =====================================================

app.post(
  '/api/watchpays/create-order',
  login,
  async (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      const plan =
        String(
          req.body.plan || ''
        ).trim();

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid amount.'
        });
      }

      if (
        !WATCHPAYS_MERCHANT_ID ||
        !WATCHPAYS_API_KEY
      ) {
        return res.status(500).json({
          success: false,
          message:
            'WatchPays Pay-in is not configured.'
        });
      }

      if (!WATCHPAYS_PAYIN_CALLBACK) {
        return res.status(500).json({
          success: false,
          message:
            'WatchPays callback URL is not configured.'
        });
      }

      const merchantOrderNo =
        makeRef('WP');

      const signature =
        watchPayinSignature({
          merchant_id:
            WATCHPAYS_MERCHANT_ID,

          amount:
            amount.toFixed(2),

          merchant_order_no:
            merchantOrderNo,

          callback_url:
            WATCHPAYS_PAYIN_CALLBACK
        });

      const payload = {
        merchant_id:
          WATCHPAYS_MERCHANT_ID,

        api_key:
          WATCHPAYS_API_KEY,

        amount:
          amount.toFixed(2),

        merchant_order_no:
          merchantOrderNo,

        callback_url:
          WATCHPAYS_PAYIN_CALLBACK,

        extra:
          plan || 'NOVE',

        signature
      };

      const response =
        await fetch(
          WATCHPAYS_PAYIN_URL,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',

              Accept:
                'application/json'
            },

            body:
              JSON.stringify(
                payload
              )
          }
        );

      const result =
        await response.json()
          .catch(() => null);

      console.log(
        'WatchPays Pay-in response:',
        result
      );

      if (
        !response.ok ||
        !result ||
        !result.success ||
        !result.payment_url
      ) {
        return res.status(502).json({
          success: false,
          message:
            result?.message ||
            'WatchPays payment URL was not returned.'
        });
      }

      const payment =
        await Payment.create({
          user_id:
            req.session.userId,

          plan:
            plan || null,

          amount:
            moneyToPaise(amount),

          currency:
            'INR',

          merchant_order_id:
            merchantOrderNo,

          platform_order_id:
            result.order_no ||
            null,

          pay_url:
            result.payment_url,

          gateway:
            'WATCHPAYS',

          status:
            result.status ||
            'created'
        });

      return res.json({
        success: true,

        paymentId:
          payment._id,

        merchant_order_no:
          merchantOrderNo,

        order_no:
          result.order_no ||
          null,

        payment_url:
          result.payment_url,

        payUrl:
          result.payment_url,

        amount
      });
    } catch (error) {
      console.error(
        'WatchPays Pay-in create error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to create WatchPays payment.'
      });
    }
  }
);

// =====================================================
// WATCHPAYS PAY-IN CALLBACK
// =====================================================

app.post(
  '/api/watchpays/callback',
  async (req, res) => {
    try {
      console.log(
        'WatchPays Pay-in callback:',
        req.body
      );

      const {
        orderNo,
        merchantOrder,
        status,
        amount
      } = req.body;

      if (!merchantOrder) {
        return res.status(400).send(
          'merchantOrder missing'
        );
      }

      const payment =
        await Payment.findOne({
          merchant_order_id:
            merchantOrder,

          gateway:
            'WATCHPAYS'
        });

      if (!payment) {
        return res.status(404).send(
          'order not found'
        );
      }

      if (
        payment.status === 'paid' ||
        payment.status === 'captured'
      ) {
        return res.send(
          'success'
        );
      }

      if (
        String(status || '')
          .toLowerCase() !==
        'success'
      ) {
        payment.status =
          String(
            status || 'failed'
          ).toLowerCase();

        await payment.save();

        return res.send(
          'success'
        );
      }

      const callbackAmount =
        Number(amount);

      const expectedAmount =
        paiseToMoney(
          payment.amount
        );

      if (
        !Number.isFinite(
          callbackAmount
        ) ||
        Math.abs(
          callbackAmount -
          expectedAmount
        ) > 0.01
      ) {
        console.error(
          'WatchPays amount mismatch:',
          {
            callbackAmount,
            expectedAmount
          }
        );

        return res.status(400).send(
          'amount mismatch'
        );
      }

      const mongoSession =
        await mongoose.startSession();

      try {
        await mongoSession.withTransaction(
          async () => {
            const fresh =
              await Payment.findById(
                payment._id
              ).session(
                mongoSession
              );

            if (!fresh) {
              throw new Error(
                'Payment not found.'
              );
            }

            if (
              fresh.status === 'paid'
            ) {
              return;
            }

            const wallet =
              await ensureWallet(
                fresh.user_id,
                mongoSession
              );

            const oldBalance =
              Number(
                wallet.balance || 0
              );

            const credit =
              Number(
                fresh.amount
              );

            const newBalance =
              oldBalance +
              credit;

            wallet.balance =
              newBalance;

            wallet.updated_at =
              new Date();

            await wallet.save({
              session:
                mongoSession
            });

            await WalletTransaction.create(
              [
                {
                  user_id:
                    fresh.user_id,

                  type:
                    'credit',

                  amount:
                    credit,

                  balance_after:
                    newBalance,

                  reference_type:
                    'watchpays_payment',

                  reference_id:
                    String(
                      fresh._id
                    ),

                  created_at:
                    new Date()
                }
              ],
              {
                session:
                  mongoSession
              }
            );

            fresh.status =
              'paid';

            fresh.paid_at =
              new Date();

            fresh.platform_order_id =
              orderNo ||
              fresh.platform_order_id ||
              null;

            await fresh.save({
              session:
                mongoSession
            });
          }
        );
      } finally {
        await mongoSession.endSession();
      }

      return res.send(
        'success'
      );
    } catch (error) {
      console.error(
        'WatchPays callback error:',
        error
      );

      return res.status(500).send(
        'callback error'
      );
    }
  }
);

// =====================================================
// WATCHPAYS PAYOUT
// =====================================================

async function sendWatchPayout(
  withdrawal
) {
  if (
    !WATCHPAYS_MERCHANT_ID ||
    !WATCHPAYS_PAYOUT_KEY
  ) {
    throw new Error(
      'WatchPays Payout is not configured.'
    );
  }

  if (!WATCHPAYS_PAYOUT_CALLBACK) {
    throw new Error(
      'WatchPays Payout callback URL is not configured.'
    );
  }

  if (
    String(
      withdrawal.method
    ).toUpperCase() !==
    'BANK'
  ) {
    throw new Error(
      'WatchPays payout API supplied for this integration supports BANK fields only.'
    );
  }

  if (
    !withdrawal.account_number ||
    !withdrawal.ifsc ||
    !withdrawal.account_name
  ) {
    throw new Error(
      'Bank details are incomplete.'
    );
  }

  const transactionId =
    `WPW_${String(
      withdrawal._id
    )}`;

  const amount =
    paiseToMoney(
      withdrawal.amount
    );

  const signature =
    watchPayoutSignature({
      merchant_id:
        WATCHPAYS_MERCHANT_ID,

      amount:
        amount.toFixed(2),

      transaction_id:
        transactionId,

      account_number:
        withdrawal.account_number,

      ifsc:
        withdrawal.ifsc,

      name:
        withdrawal.account_name,

      bank_name:
        withdrawal.bank_name ||
        '',

      callback_url:
        WATCHPAYS_PAYOUT_CALLBACK
    });

  const form =
    new URLSearchParams();

  form.set(
    'merchant_id',
    WATCHPAYS_MERCHANT_ID
  );

  form.set(
    'amount',
    amount.toFixed(2)
  );

  form.set(
    'transaction_id',
    transactionId
  );

  form.set(
    'account_number',
    withdrawal.account_number
  );

  form.set(
    'ifsc',
    withdrawal.ifsc
  );

  form.set(
    'name',
    withdrawal.account_name
  );

  form.set(
    'bank_name',
    withdrawal.bank_name || ''
  );

  form.set(
    'callback_url',
    WATCHPAYS_PAYOUT_CALLBACK
  );

  form.set(
    'signature',
    signature
  );

  const response =
    await fetch(
      WATCHPAYS_PAYOUT_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',

          Accept:
            'application/json'
        },

        body:
          form.toString()
      }
    );

  const text =
    await response.text();

  let result;

  try {
    result =
      JSON.parse(text);
  } catch {
    result = {
      raw: text
    };
  }

  console.log(
    'WatchPays Payout response:',
    result
  );

  if (
    !response.ok ||
    result?.status !== 'success'
  ) {
    throw new Error(
      result?.message ||
      'WatchPays payout request failed.'
    );
  }

  return {
    transactionId,

    amount,

    fee:
      Number(
        result?.data?.fee || 0
      ),

    totalAmount:
      Number(
        result?.data?.total_amount ||
        amount
      ),

    response:
      result
  };
}

// =====================================================
// WATCHPAYS PAYOUT CALLBACK
// =====================================================

app.post(
  '/api/watchpays/payout-callback',
  async (req, res) => {
    try {
      console.log(
        'WatchPays Payout callback:',
        req.body
      );

      const {
        merchant_id,
        transaction_id,
        amount,
        status
      } = req.body;

      if (
        String(merchant_id || '') !==
        String(
          WATCHPAYS_MERCHANT_ID
        )
      ) {
        return res.status(403).send(
          'invalid merchant'
        );
      }

      if (!transaction_id) {
        return res.status(400).send(
          'transaction_id missing'
        );
      }

      if (
        !String(
          transaction_id
        ).startsWith('WPW_')
      ) {
        return res.status(400).send(
          'invalid transaction'
        );
      }

      const withdrawalId =
        String(
          transaction_id
        ).replace(
          /^WPW_/,
          ''
        );

      if (
        !mongoose.isValidObjectId(
          withdrawalId
        )
      ) {
        return res.status(400).send(
          'invalid withdrawal'
        );
      }

      const withdrawal =
        await Withdrawal.findById(
          withdrawalId
        );

      if (!withdrawal) {
        return res.status(404).send(
          'withdrawal not found'
        );
      }

      const callbackAmount =
        Number(amount);

      const expectedAmount =
        paiseToMoney(
          withdrawal.amount
        );

      if (
        Number.isFinite(
          callbackAmount
        ) &&
        Math.abs(
          callbackAmount -
          expectedAmount
        ) > 0.01
      ) {
        return res.status(400).send(
          'amount mismatch'
        );
      }

      const normalizedStatus =
        String(
          status || ''
        ).toUpperCase();

      if (
        normalizedStatus ===
        'SUCCESS'
      ) {
        withdrawal.status =
          'completed';

        withdrawal.gateway =
          'WATCHPAYS';

        withdrawal.gateway_transaction_id =
          transaction_id;

        withdrawal.processed_at =
          new Date();

        await withdrawal.save();

        return res.send(
          'success'
        );
      }

      if (
        normalizedStatus ===
        'FAILED'
      ) {
        if (
          withdrawal.status !==
          'rejected'
        ) {
          const mongoSession =
            await mongoose.startSession();

          try {
            await mongoSession.withTransaction(
              async () => {
                const fresh =
                  await Withdrawal.findById(
                    withdrawal._id
                  ).session(
                    mongoSession
                  );

                if (!fresh) {
                  throw new Error(
                    'Withdrawal not found.'
                  );
                }

                if (
                  fresh.status ===
                  'completed'
                ) {
                  return;
                }

                if (
                  fresh.status ===
                  'rejected'
                ) {
                  return;
                }

                const wallet =
                  await ensureWallet(
                    fresh.user_id,
                    mongoSession
                  );

                const oldBalance =
                  Number(
                    wallet.balance || 0
                  );

                const newBalance =
                  oldBalance +
                  Number(
                    fresh.amount
                  );

                wallet.balance =
                  newBalance;

                wallet.updated_at =
                  new Date();

                await wallet.save({
                  session:
                    mongoSession
                });

                await WalletTransaction.create(
                  [
                    {
                      user_id:
                        fresh.user_id,

                      type:
                        'refund',

                      amount:
                        fresh.amount,

                      balance_after:
                        newBalance,

                      reference_type:
                        'watchpays_payout_failed',

                      reference_id:
                        String(
                          fresh._id
                        )
                    }
                  ],
                  {
                    session:
                      mongoSession
                  }
                );

                fresh.status =
                  'rejected';

                fresh.gateway =
                  'WATCHPAYS';

                fresh.gateway_transaction_id =
                  transaction_id;

                fresh.processed_at =
                  new Date();

                await fresh.save({
                  session:
                    mongoSession
                });
              }
            );
          } finally {
            await mongoSession.endSession();
          }
        }

        return res.send(
          'success'
        );
      }

      return res.send(
        'success'
      );
    } catch (error) {
      console.error(
        'WatchPays payout callback error:',
        error
      );

      return res.status(500).send(
        'callback error'
      );
    }
  }
);

// =====================================================
// ORDERS
// =====================================================

app.get(
  '/api/orders',
  login,
  async (req, res) => {
    try {
      const payments =
        await Payment.find({
          user_id:
            req.session.userId
        })
        .sort({
          created_at: -1
        })
        .lean();

      res.json({
        success: true,

        orders:
          payments.map(
            p => ({
              id:
                p._id,

              plan:
                p.plan,

              amount:
                paiseToMoney(
                  p.amount
                ),

              currency:
                p.currency,

              merchant_order_id:
                p.merchant_order_id,

              platform_order_id:
                p.platform_order_id,

              gateway:
                p.gateway,

              status:
                p.status,

              created_at:
                p.created_at,

              paid_at:
                p.paid_at
            })
          )
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load orders.'
      });
    }
  }
);

// =====================================================
// WITHDRAWAL REQUEST
// =====================================================

app.post(
  '/api/withdrawals',
  login,
  async (req, res) => {
    let mongoSession = null;

    try {
      const amount =
        Number(
          req.body.amount
        );

      const method =
        String(
          req.body.method ||
          req.body.withdrawalMethod ||
          'BANK'
        )
        .trim()
        .toUpperCase();

      const upiId =
        String(
          req.body.upi_id ||
          req.body.upiId ||
          ''
        ).trim();

      const accountName =
        String(
          req.body.account_name ||
          req.body.accountName ||
          ''
        ).trim();

      const accountNumber =
        String(
          req.body.account_number ||
          req.body.accountNumber ||
          ''
        ).trim();

      const confirmAccountNumber =
        String(
          req.body.confirm_account_number ||
          req.body.confirmAccountNumber ||
          req.body.confirm_account ||
          ''
        ).trim();

      const bankName =
        String(
          req.body.bank_name ||
          req.body.bankName ||
          ''
        ).trim();

      const ifsc =
        String(
          req.body.ifsc ||
          req.body.IFSC ||
          ''
        )
        .trim()
        .toUpperCase();

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid withdrawal amount.'
        });
      }

      if (amount < 50) {
        return res.status(400).json({
          success: false,
          message:
            'Minimum withdrawal amount is ₹50.'
        });
      }

      if (
        !['UPI', 'BANK'].includes(
          method
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid withdrawal method.'
        });
      }

      if (
        method === 'UPI'
      ) {
        if (!upiId) {
          return res.status(400).json({
            success: false,
            message:
              'UPI ID is required.'
          });
        }
      }

      if (
        method === 'BANK'
      ) {
        if (!accountName) {
          return res.status(400).json({
            success: false,
            message:
              'Account holder name is required.'
          });
        }

        if (!accountNumber) {
          return res.status(400).json({
            success: false,
            message:
              'Bank account number is required.'
          });
        }

        if (
          confirmAccountNumber &&
          accountNumber !==
            confirmAccountNumber
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Bank account numbers do not match.'
          });
        }

        if (!ifsc) {
          return res.status(400).json({
            success: false,
            message:
              'IFSC code is required.'
          });
        }

        if (
          !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
            ifsc
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Invalid IFSC code.'
          });
        }
      }

      const amountPaise =
        moneyToPaise(amount);

      mongoSession =
        await mongoose.startSession();

      let withdrawal;

      await mongoSession.withTransaction(
        async () => {
          const wallet =
            await ensureWallet(
              req.session.userId,
              mongoSession
            );

          const balance =
            Number(
              wallet.balance || 0
            );

          if (
            balance <
            amountPaise
          ) {
            throw new Error(
              'Insufficient wallet balance.'
            );
          }

          const newBalance =
            balance -
            amountPaise;

          wallet.balance =
            newBalance;

          wallet.updated_at =
            new Date();

          await wallet.save({
            session:
              mongoSession
          });

          const created =
            await Withdrawal.create(
              [
                {
                  user_id:
                    req.session.userId,

                  amount:
                    amountPaise,

                  currency:
                    'INR',

                  method,

                  upi_id:
                    method === 'UPI'
                      ? upiId
                      : null,

                  account_name:
                    method === 'BANK'
                      ? accountName
                      : null,

                  account_number:
                    method === 'BANK'
                      ? accountNumber
                      : null,

                  account_last4:
                    method === 'BANK'
                      ? accountNumber.slice(-4)
                      : null,

                  bank_name:
                    method === 'BANK'
                      ? bankName
                      : null,

                  ifsc:
                    method === 'BANK'
                      ? ifsc
                      : null,

                  status:
                    'pending',

                  created_at:
                    new Date()
                }
              ],
              {
                session:
                  mongoSession
              }
            );

          withdrawal =
            created[0];

          await WalletTransaction.create(
            [
              {
                user_id:
                  req.session.userId,

                type:
                  'debit',

                amount:
                  amountPaise,

                balance_after:
                  newBalance,

                reference_type:
                  'withdrawal',

                reference_id:
                  String(
                    withdrawal._id
                  )
              }
            ],
            {
              session:
                mongoSession
            }
          );
        }
      );

      return res.json({
        success: true,

        message:
          'Withdrawal request submitted successfully.',

        withdrawal: {
          id:
            withdrawal._id,

          amount,

          method,

          status:
            withdrawal.status
        }
      });
    } catch (error) {
      console.error(
        'Withdrawal error:',
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          'Unable to submit withdrawal.'
      });
    } finally {
      if (mongoSession) {
        await mongoSession.endSession()
          .catch(() => {});
      }
    }
  }
);

// =====================================================
// USER WITHDRAWAL HISTORY
// =====================================================

app.get(
  '/api/withdrawals',
  login,
  async (req, res) => {
    try {
      const withdrawals =
        await Withdrawal.find({
          user_id:
            req.session.userId
        })
        .sort({
          created_at: -1
        })
        .lean();

      res.json({
        success: true,

        withdrawals:
          withdrawals.map(
            w => ({
              id:
                w._id,

              amount:
                paiseToMoney(
                  w.amount
                ),

              currency:
                w.currency,

              method:
                w.method,

              upi_id:
                w.upi_id,

              account_name:
                w.account_name,

              account_last4:
                w.account_last4,

              ifsc:
                w.ifsc,

              bank_name:
                w.bank_name,

              gateway:
                w.gateway,

              status:
                w.status,

              created_at:
                w.created_at,

              processed_at:
                w.processed_at
            })
          )
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load withdrawals.'
      });
    }
  }
);

// =====================================================
// ADMIN LOGIN
// =====================================================

app.post(
  '/api/admin/login',
  async (req, res) => {
    try {
      const username =
        String(
          req.body.username || ''
        ).trim();

      const password =
        String(
          req.body.password || ''
        );

      if (
        !ADMIN_USERNAME ||
        !ADMIN_PASSWORD
      ) {
        return res.status(500).json({
          success: false,
          message:
            'Admin credentials are not configured.'
        });
      }

      if (
        username !==
          ADMIN_USERNAME ||
        password !==
          ADMIN_PASSWORD
      ) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid admin credentials.'
        });
      }

      req.session.regenerate(
        error => {
          if (error) {
            return res.status(500).json({
              success: false,
              message:
                'Unable to create admin session.'
            });
          }

          req.session.userId =
            null;

          req.session.isAdmin =
            true;

          req.session.save(
            saveError => {
              if (saveError) {
                return res.status(500).json({
                  success: false,
                  message:
                    'Unable to save admin session.'
                });
              }

              res.json({
                success: true,
                isAdmin: true,
                message:
                  'Admin login successful.'
              });
            }
          );
        }
      );
    } catch (error) {
      console.error(
        'Admin login error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Admin login failed.'
      });
    }
  }
);

// =====================================================
// ADMIN ME
// =====================================================

app.get(
  '/api/admin/me',
  admin,
  (req, res) => {
    res.json({
      success: true,
      isAdmin: true
    });
  }
);

// =====================================================
// ADMIN LOGOUT
// =====================================================

app.post(
  '/api/admin/logout',
  (req, res) => {
    if (!req.session) {
      return res.json({
        success: true
      });
    }

    req.session.isAdmin =
      false;

    req.session.userId =
      null;

    req.session.save(
      error => {
        if (error) {
          return res.status(500).json({
            success: false,
            message:
              'Admin logout failed.'
          });
        }

        res.json({
          success: true,
          message:
            'Admin logged out.'
        });
      }
    );
  }
);

// =====================================================
// ADMIN USERS
// =====================================================

app.get(
  '/api/admin/users',
  admin,
  async (req, res) => {
    try {
      const users =
        await User.find()
          .sort({
            created_at: -1
          })
          .lean();

      const result = [];

      for (
        const user of users
      ) {
        const wallet =
          await Wallet.findOne({
            user_id:
              user._id
          }).lean();

        result.push({
          id:
            user._id,

          name:
            user.name,

          phone:
            user.phone,

          referral_code:
            user.referral_code,

          referred_by:
            user.referred_by,

          balance:
            paiseToMoney(
              wallet?.balance || 0
            ),

          banned:
            user.banned === true,

          vip_level:
            user.vip_level || 0,

          created_at:
            user.created_at
        });
      }

      res.json({
        success: true,
        users: result
      });
    } catch (error) {
      console.error(
        'Admin users error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Unable to load users.'
      });
    }
  }
);

// =====================================================
// BAN / UNBAN
// =====================================================

app.post(
  '/api/admin/users/:userId/ban',
  admin,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.params.userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.'
        });
      }

      user.banned = true;

      await user.save();

      res.json({
        success: true,
        message:
          'User banned successfully.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to ban user.'
      });
    }
  }
);

app.post(
  '/api/admin/users/:userId/unban',
  admin,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.params.userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.'
        });
      }

      user.banned = false;

      await user.save();

      res.json({
        success: true,
        message:
          'User unbanned successfully.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to unban user.'
      });
    }
  }
);

// =====================================================
// LOGIN AS USER
// =====================================================

app.post(
  '/api/admin/users/:userId/login-as',
  admin,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.params.userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.'
        });
      }

      if (user.banned) {
        return res.status(403).json({
          success: false,
          message:
            'User is banned.'
        });
      }

      req.session.regenerate(
        error => {
          if (error) {
            return res.status(500).json({
              success: false,
              message:
                'Unable to create session.'
            });
          }

          req.session.userId =
            user._id.toString();

          req.session.isAdmin =
            false;

          req.session.save(
            saveError => {
              if (saveError) {
                return res.status(500).json({
                  success: false,
                  message:
                    'Unable to save session.'
                });
              }

              res.json({
                success: true,
                user:
                  safeUser(user)
              });
            }
          );
        }
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to login as user.'
      });
    }
  }
);

// =====================================================
// ADMIN BALANCE
// =====================================================

app.post(
  '/api/admin/users/:userId/balance',
  admin,
  async (req, res) => {
    const mongoSession =
      await mongoose.startSession();

    try {
      const amount =
        Number(
          req.body.amount
        );

      const type =
        String(
          req.body.type ||
          'credit'
        ).toLowerCase();

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid amount.'
        });
      }

      if (
        !['credit', 'debit'].includes(
          type
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid type.'
        });
      }

      const amountPaise =
        moneyToPaise(amount);

      let finalBalance = 0;

      await mongoSession.withTransaction(
        async () => {
          const user =
            await User.findById(
              req.params.userId
            ).session(
              mongoSession
            );

          if (!user) {
            throw new Error(
              'User not found.'
            );
          }

          const wallet =
            await ensureWallet(
              user._id,
              mongoSession
            );

          const old =
            Number(
              wallet.balance || 0
            );

          if (
            type === 'debit' &&
            old < amountPaise
          ) {
            throw new Error(
              'Insufficient wallet balance.'
            );
          }

          finalBalance =
            type === 'credit'
              ? old + amountPaise
              : old - amountPaise;

          wallet.balance =
            finalBalance;

          wallet.updated_at =
            new Date();

          await wallet.save({
            session:
              mongoSession
          });

          await WalletTransaction.create(
            [
              {
                user_id:
                  user._id,

                type,

                amount:
                  amountPaise,

                balance_after:
                  finalBalance,

                reference_type:
                  'admin_adjustment',

                reference_id:
                  makeRef('ADMIN')
              }
            ],
            {
              session:
                mongoSession
            }
          );
        }
      );

      res.json({
        success: true,
        balance:
          paiseToMoney(
            finalBalance
          )
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error.message ||
          'Unable to update balance.'
      });
    } finally {
      await mongoSession.endSession()
        .catch(() => {});
    }
  }
);

// =====================================================
// ADMIN WITHDRAWALS
// =====================================================

app.get(
  '/api/admin/withdrawals',
  admin,
  async (req, res) => {
    try {
      const withdrawals =
        await Withdrawal.find()
          .populate(
            'user_id',
            'name phone'
          )
          .sort({
            created_at: -1
          })
          .lean();

      res.json({
        success: true,

        withdrawals:
          withdrawals.map(
            w => ({
              id:
                w._id,

              user:
                w.user_id
                  ? {
                      id:
                        w.user_id._id,

                      name:
                        w.user_id.name,

                      phone:
                        w.user_id.phone
                    }
                  : null,

              amount:
                paiseToMoney(
                  w.amount
                ),

              currency:
                w.currency,

              method:
                w.method,

              upi_id:
                w.upi_id,

              account_name:
                w.account_name,

              account_last4:
                w.account_last4,

              ifsc:
                w.ifsc,

              bank_name:
                w.bank_name,

              gateway:
                w.gateway,

              gateway_transaction_id:
                w.gateway_transaction_id,

              status:
                w.status,

              created_at:
                w.created_at,

              processed_at:
                w.processed_at
            })
          )
      });
    } catch (error) {
      console.error(
        'Admin withdrawals error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Unable to load withdrawals.'
      });
    }
  }
);

// =====================================================
// ADMIN PROCESS WITHDRAWAL
// =====================================================

async function processWithdrawal(
  req,
  res
) {
  try {
    const withdrawal =
      await Withdrawal.findById(
        req.params.id
      );

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message:
          'Withdrawal not found.'
      });
    }

    if (
      withdrawal.status !==
        'pending' &&
      withdrawal.status !==
        'processing'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Withdrawal cannot be processed.'
      });
    }

    // -------------------------------------------------
    // WATCHPAYS BANK PAYOUT
    // -------------------------------------------------

    if (
      withdrawal.method ===
        'BANK' &&
      WATCHPAYS_MERCHANT_ID &&
      WATCHPAYS_PAYOUT_KEY
    ) {
      if (
        withdrawal.gateway_transaction_id
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Payout has already been submitted.'
        });
      }

      const payout =
        await sendWatchPayout(
          withdrawal
        );

      withdrawal.status =
        'processing';

      withdrawal.gateway =
        'WATCHPAYS';

      withdrawal.gateway_transaction_id =
        payout.transactionId;

      withdrawal.gateway_fee =
        moneyToPaise(
          payout.fee || 0
        );

      withdrawal.processed_at =
        new Date();

      await withdrawal.save();

      return res.json({
        success: true,

        message:
          'WatchPays payout submitted successfully.',

        gateway:
          'WATCHPAYS',

        transaction_id:
          payout.transactionId,

        amount:
          payout.amount,

        fee:
          payout.fee
      });
    }

    // -------------------------------------------------
    // MANUAL PROCESSING
    // -------------------------------------------------

    withdrawal.status =
      'processing';

    withdrawal.processed_at =
      new Date();

    await withdrawal.save();

    return res.json({
      success: true,

      message:
        'Withdrawal moved to processing.'
    });
  } catch (error) {
    console.error(
      'Process withdrawal error:',
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        'Unable to process withdrawal.'
    });
  }
}

app.post(
  '/api/admin/withdrawals/:id/process',
  admin,
  processWithdrawal
);

app.post(
  '/api/admin/withdrawals/:id/processing',
  admin,
  processWithdrawal
);

// =====================================================
// ADMIN COMPLETE
// =====================================================

app.post(
  '/api/admin/withdrawals/:id/complete',
  admin,
  async (req, res) => {
    try {
      const withdrawal =
        await Withdrawal.findById(
          req.params.id
        );

      if (!withdrawal) {
        return res.status(404).json({
          success: false,
          message:
            'Withdrawal not found.'
        });
      }

      if (
        withdrawal.status !==
        'processing'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Withdrawal must be processing.'
        });
      }

      withdrawal.status =
        'completed';

      withdrawal.processed_at =
        new Date();

      await withdrawal.save();

      res.json({
        success: true,
        message:
          'Withdrawal completed.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to complete withdrawal.'
      });
    }
  }
);

// =====================================================
// ADMIN REJECT + REFUND
// =====================================================

async function rejectWithdrawal(
  req,
  res
) {
  const mongoSession =
    await mongoose.startSession();

  try {
    await mongoSession.withTransaction(
      async () => {
        const withdrawal =
          await Withdrawal.findById(
            req.params.id
          ).session(
            mongoSession
          );

        if (!withdrawal) {
          throw new Error(
            'Withdrawal not found.'
          );
        }

        if (
          withdrawal.status ===
          'completed'
        ) {
          throw new Error(
            'Completed withdrawal cannot be rejected.'
          );
        }

        if (
          withdrawal.status ===
          'rejected'
        ) {
          return;
        }

        const wallet =
          await ensureWallet(
            withdrawal.user_id,
            mongoSession
          );

        const old =
          Number(
            wallet.balance || 0
          );

        const next =
          old +
          Number(
            withdrawal.amount
          );

        wallet.balance =
          next;

        wallet.updated_at =
          new Date();

        await wallet.save({
          session:
            mongoSession
        });

        await WalletTransaction.create(
          [
            {
              user_id:
                withdrawal.user_id,

              type:
                'refund',

              amount:
                withdrawal.amount,

              balance_after:
                next,

              reference_type:
                'withdrawal_refund',

              reference_id:
                String(
                  withdrawal._id
                )
            }
          ],
          {
            session:
              mongoSession
          }
        );

        withdrawal.status =
          'rejected';

        withdrawal.processed_at =
          new Date();

        await withdrawal.save({
          session:
            mongoSession
        });
      }
    );

    res.json({
      success: true,
      message:
        'Withdrawal rejected and amount refunded.'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message:
        error.message ||
        'Unable to reject withdrawal.'
    });
  } finally {
    await mongoSession.endSession()
      .catch(() => {});
  }
}

app.post(
  '/api/admin/withdrawals/:id/reject',
  admin,
  rejectWithdrawal
);

app.post(
  '/api/admin/withdrawals/:id/refund',
  admin,
  rejectWithdrawal
);

// =====================================================
// ADMIN VIP
// =====================================================

app.post(
  '/api/admin/users/:userId/vip',
  admin,
  async (req, res) => {
    try {
      const level =
        Number(
          req.body.vip_level ??
          req.body.level ??
          0
        );

      if (
        !Number.isInteger(level) ||
        level < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid VIP level.'
        });
      }

      const user =
        await User.findByIdAndUpdate(
          req.params.userId,
          {
            vip_level:
              level
          },
          {
            new: true
          }
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.'
        });
      }

      res.json({
        success: true,
        message:
          'VIP level updated.',
        vip_level:
          user.vip_level
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to update VIP.'
      });
    }
  }
);

app.post(
  '/api/admin/users/:userId/vip5',
  admin,
  async (req, res) => {
    req.body.vip_level = 5;

    return app._router.handle(
      req,
      res,
      () => {}
    );
  }
);

// =====================================================
// PLANS
// =====================================================

app.get(
  '/api/plans',
  async (req, res) => {
    try {
      const plans =
        await Plan.find({
          active: true
        })
        .sort({
          amount: 1
        })
        .lean();

      res.json({
        success: true,
        plans
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load plans.'
      });
    }
  }
);

app.post(
  '/api/admin/plans',
  admin,
  async (req, res) => {
    try {
      const plan =
        await Plan.create({
          name:
            String(
              req.body.name || ''
            ).trim(),

          amount:
            Number(
              req.body.amount
            ),

          duration_days:
            Number(
              req.body.duration_days ||
              0
            ),

          daily_return:
            Number(
              req.body.daily_return ||
              0
            ),

          total_return:
            Number(
              req.body.total_return ||
              0
            ),

          active:
            req.body.active !== false
        });

      res.json({
        success: true,
        plan
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to create plan.'
      });
    }
  }
);

// =====================================================
// INVESTMENTS
// =====================================================

app.get(
  '/api/investments',
  login,
  async (req, res) => {
    try {
      const investments =
        await Investment.find({
          user_id:
            req.session.userId
        })
        .sort({
          started_at: -1
        })
        .lean();

      res.json({
        success: true,
        investments
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load investments.'
      });
    }
  }
);

app.post(
  '/api/investments',
  login,
  async (req, res) => {
    try {
      const amount =
        Number(
          req.body.amount
        );

      const planId =
        req.body.plan_id ||
        null;

      const plan =
        planId &&
        mongoose.isValidObjectId(
          planId
        )
          ? await Plan.findById(
              planId
            )
          : null;

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid investment amount.'
        });
      }

      const amountPaise =
        moneyToPaise(amount);

      const mongoSession =
        await mongoose.startSession();

      let investment;

      try {
        await mongoSession.withTransaction(
          async () => {
            const wallet =
              await ensureWallet(
                req.session.userId,
                mongoSession
              );

            if (
              wallet.balance <
              amountPaise
            ) {
              throw new Error(
                'Insufficient wallet balance.'
              );
            }

            wallet.balance -=
              amountPaise;

            wallet.updated_at =
              new Date();

            await wallet.save({
              session:
                mongoSession
            });

            const created =
              await Investment.create(
                [
                  {
                    user_id:
                      req.session.userId,

                    plan_id:
                      plan?._id ||
                      null,

                    plan_name:
                      plan?.name ||
                      req.body.plan ||
                      null,

                    amount:
                      amountPaise,

                    status:
                      'active',

                    started_at:
                      new Date(),

                    expires_at:
                      plan?.duration_days
                        ? new Date(
                            Date.now() +
                            plan.duration_days *
                              24 *
                              60 *
                              60 *
                              1000
                          )
                        : null
                  }
                ],
                {
                  session:
                    mongoSession
                }
              );

            investment =
              created[0];

            await WalletTransaction.create(
              [
                {
                  user_id:
                    req.session.userId,

                  type:
                    'debit',

                  amount:
                    amountPaise,

                  balance_after:
                    wallet.balance,

                  reference_type:
                    'investment',

                  reference_id:
                    String(
                      investment._id
                    )
                }
              ],
              {
                session:
                  mongoSession
              }
            );
          }
        );
      } finally {
        await mongoSession.endSession();
      }

      res.json({
        success: true,
        investment
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error.message ||
          'Unable to create investment.'
      });
    }
  }
);

// =====================================================
// TRANSACTIONS
// =====================================================

app.get(
  '/api/transactions',
  login,
  async (req, res) => {
    try {
      const transactions =
        await WalletTransaction.find({
          user_id:
            req.session.userId
        })
        .sort({
          created_at: -1
        })
        .limit(200)
        .lean();

      res.json({
        success: true,

        transactions:
          transactions.map(
            t => ({
              id:
                t._id,

              type:
                t.type,

              amount:
                paiseToMoney(
                  t.amount
                ),

              balance_after:
                paiseToMoney(
                  t.balance_after
                ),

              reference_type:
                t.reference_type,

              reference_id:
                t.reference_id,

              created_at:
                t.created_at
            })
          )
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load transactions.'
      });
    }
  }
);

// =====================================================
// NOTIFICATIONS
// =====================================================

app.get(
  '/api/notifications',
  login,
  async (req, res) => {
    try {
      const notifications =
        await Notification.find({
          user_id:
            req.session.userId
        })
        .sort({
          created_at: -1
        })
        .limit(100)
        .lean();

      res.json({
        success: true,
        notifications
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load notifications.'
      });
    }
  }
);

app.post(
  '/api/notifications/:id/read',
  login,
  async (req, res) => {
    try {
      await Notification.updateOne(
        {
          _id:
            req.params.id,

          user_id:
            req.session.userId
        },
        {
          $set: {
            read: true
          }
        }
      );

      res.json({
        success: true
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to update notification.'
      });
    }
  }
);

// =====================================================
// ADMIN NOTIFICATION
// =====================================================

app.post(
  '/api/admin/notifications',
  admin,
  async (req, res) => {
    try {
      const title =
        String(
          req.body.title || ''
        ).trim();

      const message =
        String(
          req.body.message || ''
        ).trim();

      const userId =
        req.body.user_id || null;

      if (
        !title ||
        !message
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Title and message are required.'
        });
      }

      if (userId) {
        await Notification.create({
          user_id:
            userId,
          title,
          message
        });
      } else {
        const users =
          await User.find()
            .select('_id')
            .lean();

        if (users.length) {
          await Notification.insertMany(
            users.map(
              user => ({
                user_id:
                  user._id,
                title,
                message
              })
            )
          );
        }
      }

      res.json({
        success: true,
        message:
          'Notification sent.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to send notification.'
      });
    }
  }
);

// =====================================================
// SETTINGS
// =====================================================

app.get(
  '/api/settings',
  async (req, res) => {
    try {
      const settings =
        await PlatformSettings
          .find()
          .lean();

      const result = {};

      for (
        const item of settings
      ) {
        result[item.key] =
          item.value;
      }

      res.json({
        success: true,
        settings:
          result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load settings.'
      });
    }
  }
);

app.post(
  '/api/admin/settings',
  admin,
  async (req, res) => {
    try {
      const {
        key,
        value
      } = req.body;

      if (!key) {
        return res.status(400).json({
          success: false,
          message:
            'Setting key is required.'
        });
      }

      await PlatformSettings.findOneAndUpdate(
        {
          key:
            String(key)
        },
        {
          key:
            String(key),

          value,

          updated_at:
            new Date()
        },
        {
          upsert: true,
          new: true
        }
      );

      res.json({
        success: true,
        message:
          'Setting updated.'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to update setting.'
      });
    }
  }
);

// =====================================================
// ADMIN SUMMARY
// =====================================================

app.get(
  '/api/admin/summary',
  admin,
  async (req, res) => {
    try {
      const totalUsers =
        await User.countDocuments();

      const walletResult =
        await Wallet.aggregate([
          {
            $group: {
              _id: null,

              total: {
                $sum: {
                  $ifNull: [
                    '$balance',
                    0
                  ]
                }
              }
            }
          }
        ]);

      const totalBalance =
        Number(
          walletResult[0]?.total || 0
        );

      const payments =
        await Payment.aggregate([
          {
            $match: {
              status: {
                $in: [
                  'paid',
                  'captured'
                ]
              }
            }
          },
          {
            $group: {
              _id: null,

              total: {
                $sum: {
                  $ifNull: [
                    '$amount',
                    0
                  ]
                }
              },

              count: {
                $sum: 1
              }
            }
          }
        ]);

      const withdrawals =
        await Withdrawal.aggregate([
          {
            $group: {
              _id:
                '$status',

              amount: {
                $sum: {
                  $ifNull: [
                    '$amount',
                    0
                  ]
                }
              },

              count: {
                $sum: 1
              }
            }
          }
        ]);

      let pending = 0;
      let processing = 0;
      let completed = 0;
      let totalWithdrawn = 0;

      for (
        const row of withdrawals
      ) {
        const status =
          String(
            row._id || ''
          ).toLowerCase();

        if (
          status === 'pending'
        ) {
          pending =
            Number(row.count);
        }

        if (
          status === 'processing'
        ) {
          processing =
            Number(row.count);
        }

        if (
          status === 'completed'
        ) {
          completed =
            Number(row.count);

          totalWithdrawn +=
            Number(
              row.amount || 0
            );
        }
      }

      const totalPayments =
        Number(
          payments[0]?.total || 0
        );

      const successfulPayments =
        Number(
          payments[0]?.count || 0
        );

      res.json({
        success: true,

        total_users:
          totalUsers,

        totalUsers:
          totalUsers,

        totalBalance:
          paiseToMoney(
            totalBalance
          ),

        total_balance:
          paiseToMoney(
            totalBalance
          ),

        totalPayments:
          paiseToMoney(
            totalPayments
          ),

        total_payments:
          paiseToMoney(
            totalPayments
          ),

        successful_payments:
          successfulPayments,

        pending:
          pending,

        pending_withdrawals:
          pending,

        processing:
          processing,

        processing_withdrawals:
          processing,

        completed_withdrawals:
          completed,

        totalWithdrawn:
          paiseToMoney(
            totalWithdrawn
          ),

        total_withdrawals:
          paiseToMoney(
            totalWithdrawn
          )
      });
    } catch (error) {
      console.error(
        'Summary error:',
        error
      );

      res.status(500).json({
        success: false,
        message:
          'Unable to load summary.'
      });
    }
  }
);

// =====================================================
// TOTAL USERS
// =====================================================

app.get(
  '/api/admin/total-users',
  admin,
  async (req, res) => {
    try {
      const total =
        await User.countDocuments();

      res.json({
        success: true,
        total_users:
          total
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to get users.'
      });
    }
  }
);

// =====================================================
// ADMIN ACTIVITY
// =====================================================

app.get(
  '/api/admin/activity',
  admin,
  async (req, res) => {
    try {
      const activity =
        await AdminActivity.find()
          .sort({
            created_at: -1
          })
          .limit(200)
          .lean();

      res.json({
        success: true,
        activity
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          'Unable to load activity.'
      });
    }
  }
);

// =====================================================
// LOGOUT
// =====================================================

app.post(
  '/api/logout',
  (req, res) => {
    if (!req.session) {
      return res.json({
        success: true
      });
    }

    req.session.destroy(
      error => {
        if (error) {
          return res.status(500).json({
            success: false,
            message:
              'Logout failed.'
          });
        }

        res.clearCookie(
          'nove.sid'
        );

        res.json({
          success: true,
          message:
            'Logged out successfully.'
        });
      }
    );
  }
);

// =====================================================
// STATIC FILES
// =====================================================

app.use(
  express.static(
    __dirname,
    {
      index: false,
      fallthrough: true
    }
  )
);

// =====================================================
// ADMIN STATIC
// =====================================================

app.use(
  '/admin',
  express.static(
    path.join(
      __dirname,
      'admin'
    ),
    {
      index: false,
      fallthrough: false
    }
  )
);

// =====================================================
// ADMIN PAGES
// =====================================================

app.get(
  '/admin.html',
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'admin.html'
      )
    );
  }
);

app.get(
  '/admin-dashboard.html',
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'admin-dashboard.html'
      )
    );
  }
);

// =====================================================
// ROOT
// =====================================================

app.get(
  '/',
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'index.html'
      )
    );
  }
);

// =====================================================
// 404 API
// =====================================================

app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      success: false,
      message:
        'API endpoint not found.'
    });
  }
);

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      'Unhandled server error:',
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      success: false,
      message:
        'Internal server error.'
    });
  }
);

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
  try {
    await mongoose.connect(
      MONGO_URI
    );

    console.log(
      'MongoDB connected successfully.'
    );

    console.log(
      'RS Payment:',
      RSPAY_MERCHANT_ID
        ? 'configured'
        : 'NOT configured'
    );

    console.log(
      'WatchPays Pay-in:',
      WATCHPAYS_MERCHANT_ID &&
        WATCHPAYS_API_KEY
        ? 'configured'
        : 'NOT configured'
    );

    console.log(
      'WatchPays Payout:',
      WATCHPAYS_MERCHANT_ID &&
        WATCHPAYS_PAYOUT_KEY
        ? 'configured'
        : 'NOT configured'
    );

    app.listen(
      PORT,
      () => {
        console.log(
          `NOVE server running on port ${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      'MongoDB connection failed:',
      error
    );

    process.exit(1);
  }
}

startServer();
