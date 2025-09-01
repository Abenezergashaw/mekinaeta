// index.js
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your BotFather token
const TOKEN = "8260792818:AAG-MnHOaeqZmLkW4_Frl8CHwMhaz9EZ1ck";

// Create bot instance (polling mode)
const bot = new TelegramBot(TOKEN, { polling: true });

const userStates = {};

const numbers = Array.from({ length: 2000 }, (_, i) => i + 1);
const PAGE_SIZE = 100;

// Utility: Get page data
function getPage(page) {
  const start = page * pageSize;
  const end = start + pageSize;
  return numbers.slice(start, end).join(", ");
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  delete userStates[chatId];

  // Define 4 buttons
  const options = {
    reply_markup: {
      keyboard: [
        ["አዲስ ሰው መመዝገብ 👤", "የተያዙ ቁጥሮችን እይ 🔐"],
        ["የእጣ ቁጥር ይፍትሹ ❓", "በስልክ ቁጥር ፈልግ 🔎"],
        ["መረጃ 📌", "እርዳታ ⓘ"],
      ],
      resize_keyboard: true, // makes buttons smaller
      one_time_keyboard: false, // keep keyboard open
    },
  };

  bot.sendMessage(chatId, "👇", options);
});

// Handle button responses
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "አዲስ ሰው መመዝገብ 👤") {
    userStates[chatId] = { step: "awaitingPhone" };
    bot.sendMessage(chatId, "እባክዎ የስልክ ቁጥርዎን ያስገቡ (09... or 07...) 📱");
    return;
  } else if (text === "የተያዙ ቁጥሮችን እይ 🔐") {
    delete userStates[chatId];

    const numbers = await getAllSelected();
    if (!numbers) {
      bot.sendMessage(chatId, "ምንም የተመረጠ የእጣ ቁጥር የለም።");
      return;
    }

    sendPage(chatId, 0, numbers);
  } else if (text === "የእጣ ቁጥር ይፍትሹ ❓") {
    userStates[chatId] = { step: "awaitingNumberCheck" };
    bot.sendMessage(chatId, "❓ እባክዎ ቁጥር ከ 1 እስከ 2000 ያስገቡ 🔢");
    return;
  } else if (text === "በስልክ ቁጥር ፈልግ 🔎") {
    userStates[chatId] = { step: "awaitingPhoneSearch" };
    bot.sendMessage(chatId, "🔎 እባክዎ ስልክ ቁጥሩን ይላኩልን");
    return;
  } else if (text === "መረጃ 📌") {
    delete userStates[chatId];

    getInfo(chatId);
    return;
  } else if (text === "እርዳታ ⓘ") {
    delete userStates[chatId];
    getHelp(chatId);
    return;
  }

  // Step 2: Validate phone
  if (userStates[chatId]?.step === "awaitingPhone") {
    const phoneRegex = /^(09|07)\d{8}$/;
    if (!phoneRegex.test(text)) {
      bot.sendMessage(
        chatId,
        "❌ የተሳሳተ ስልክ ቁጥር። እባክዎ 09 ወይም 07 የሚጀምር 10 አሃዝ ያስገቡ።"
      );
      return;
    }
    // Save phone
    userStates[chatId].phone = text;
    userStates[chatId].step = "awaitingNumber";
    bot.sendMessage(
      chatId,
      "✅ ስልክ ቁጥር ተቀባይነት አግኝቷል።\nእባክዎ 1 - 2000 መካከል ቁጥር ያስገቡ 🔢"
    );
    return;
  }

  // Step 3: Validate number between 1-2000
  if (userStates[chatId]?.step === "awaitingNumber") {
    const number = parseInt(text, 10);
    if (isNaN(number) || number < 1 || number > 2000) {
      bot.sendMessage(chatId, "❌ ትክክለኛ ቁጥር ያስገቡ (1-2000)።");
      return;
    }

    // Save number
    userStates[chatId].chosenNumber = number;

    // Done
    bot.sendMessage(chatId, "🎉 በትክክል ተመዝግበዋል። ✅");
    console.log("Registered User:");
    await createUser(userStates[chatId]);
    // Clear state
    delete userStates[chatId];
    return;
  }

  if (userStates[chatId]?.step === "awaitingNumberCheck") {
    // const number = parseInt(text, 10);
    const number = text;

    if (isNaN(number) || number < 1 || number > 2000) {
      bot.sendMessage(
        chatId,
        "❌ ትክክለኛ ቁጥር አልሰጠም። እባክዎ 1 - 2000 መካከል ቁጥር ያስገቡ 🔢"
      );
    } else {
      const is = await ifNumberIsSelected(number);
      console.log(number, is);
      if (is) {
        bot.sendMessage(chatId, `✅ እጣ ቁጥር ${number} ተይዟል።`);
      } else {
        bot.sendMessage(chatId, `❎  እጣ ቁጥር ${number} አልተያዘም።`);
      }
    }
    // Number is valid
    //  bot.sendMessage(chatId, `✅ ቁጥር ${number} ትክክል ነው!`);

    // Clear the user state
    delete userStates[chatId];
    return;
  }

  if (userStates[chatId]?.step === "awaitingPhoneSearch") {
    // const number = parseInt(text, 10);
    const phoneRegex = /^(09|07)\d{8}$/;
    if (!phoneRegex.test(text)) {
      bot.sendMessage(
        chatId,
        "❌ የተሳሳተ ስልክ ቁጥር። እባክዎ 09 ወይም 07 የሚጀምር 10 አሃዝ ያስገቡ።"
      );
      // return;
    } else {
      // console.log(text);
      const user = await getUser(text);
      if (user) {
        const message = `
  👤 መረጃ
  ----------------------
  ስልክ ቁጥር: ${user.phone}
  የተያዙ ቁጥሮች: ${user.number.split(",").join(", ")}
  የተመዘገቡበት ቀን: ${user.joinedAt.toLocaleString().slice(0, 10)}
  `;

        // Send via bot
        bot.sendMessage(chatId, message);
      } else {
        bot.sendMessage(chatId, "❌ ያስገቡት ስልክ ቁጥር አልተመዘገበም። እባክዎ እንደገና ይሞክሩ።");
      }
    }

    delete userStates[chatId];
    return;
  }
});

async function sendPage(chatId, page, numbers) {
  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageNumbers = numbers.slice(start, end);

  if (pageNumbers.length === 0) {
    return bot.sendMessage(chatId, "No more numbers.");
  }

  const totalPages = Math.ceil(numbers.length / PAGE_SIZE);
  const message = `ጠቅላላ  እጣዎች ፡ ${2000}\n\nጠቅላላ የተያዙ እጣዎች ፡ ${
    numbers.length
  }\n\nቀሪ እጣዎች ፡ ${2000 - numbers.length}\n\n📋 ገፅ ${
    page + 1
  }/${totalPages}\n\n እጣዎች\n\n${pageNumbers.join(", ")}`;

  // Inline buttons for pagination
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          ...(page > 0
            ? [{ text: "⬅️ Prev", callback_data: `prev_${page}` }]
            : []),
          ...(end < numbers.length
            ? [{ text: "Next ➡️", callback_data: `next_${page}` }]
            : []),
        ],
      ],
    },
  };

  await bot.sendMessage(chatId, message, opts);
}

// Handle pagination button clicks
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  const numbers = await getAllSelected();
  if (!numbers) {
    bot.sendMessage(chatId, "ምንም የተመረጠ የእጣ ቁጥር የለም።");
    return;
  }

  if (data.startsWith("next_")) {
    const page = parseInt(data.split("_")[1]) + 1;
    sendPage(chatId, page, numbers);
  } else if (data.startsWith("prev_")) {
    const page = parseInt(data.split("_")[1]) - 1;
    sendPage(chatId, page, numbers);
  }

  // Acknowledge button click
  bot.answerCallbackQuery(query.id);
});

// Basic express route
app.get("/", (req, res) => {
  res.send("Telegram bot server is running 🚀");
});

async function createUser(data) {
  try {
    const [rows] = await pool.query("SELECT number FROM user WHERE phone = ?", [
      data.phone,
    ]);
    if (rows.length > 0) {
      const raw = rows[0].number;
      const asString =
        raw == null
          ? ""
          : Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : String(raw);

      const list = asString
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // avoid duplicates
      const v = String(data.chosenNumber);
      if (!list.includes(v)) list.push(v);

      const updated = list.join(",");
      await pool.query("UPDATE user SET `number` = ? WHERE phone = ?", [
        updated,
        data.phone,
      ]);
    } else {
      // ❌ User does not exist → Insert new
      await pool.query(
        "INSERT INTO user (phone, number, joined) VALUES (?, ?, ?)",
        [data.phone, String(data.chosenNumber), true]
      );
      console.log("✅ New user inserted:", data.phone);
    }

    await pool.query(
      "Update numbers set selectedNumbers = json_array_append(selectedNumbers, '$', ?) where id = ?",
      [data.chosenNumber, 1]
    );

    // console.log("✅ Game inserted successfully");
  } catch (err) {
    console.error("❌ Error inserting game:", err.message);
  }
}

async function getAllSelected() {
  try {
    const [rows] = await pool.query(
      "select selectedNumbers from numbers where id = 1"
    );
    if (rows.length > 0) {
      return JSON.parse(rows[0].selectedNumbers).sort();
    } else {
      return false;
    }
  } catch (err) {}
}
async function ifNumberIsSelected(n) {
  try {
    const [rows] = await pool.query(
      "select selectedNumbers from numbers where id = 1"
    );

    const numbers = JSON.parse(rows[0].selectedNumbers);
    console.log("Heyyy: ", JSON.parse(rows[0].selectedNumbers));
    // console.log();
    return numbers.map(String).includes(String(n));
  } catch (err) {}
}

async function getUser(phone) {
  try {
    const [rows] = await pool.query("SELECT * FROM user WHERE phone = ?", [
      phone,
    ]);
    console.log(rows);
    if (rows.length > 0) {
      return rows[0];
    } else {
      return false;
    }
  } catch (err) {}
}

async function getInfo(chatId) {
  try {
    const [n] = await pool.query(
      "select selectedNumbers from numbers where id = 1"
    );
    const numbers = JSON.parse(n[0].selectedNumbers).sort();

    const [u] = await pool.query("SELECT COUNT(*) AS total FROM user;");
    const users = u[0].total;

    bot.sendMessage(chatId, "የተመዘገቡ ደንበኞች፡ " + users);
  } catch (err) {}
}

function getHelp(chatId) {
  bot.sendMessage(
    chatId,
    `የቦት አጠቃቀም \n\n1. አዲስ ሰው መመዝገብ \n\n 'አዲስ ሰው መመዝገብ 👤' ሚለውን በተን ከተጫኑ በኋላ የሚመዘገበውን ሰው ስልክ ቁጥር ላኩ። ከዛ በኋላ የመረጡትን ቁጥር ይላኩ። \n\n 2. የተያዙ ቁጥሮችን ለማየት 'የተያዙ ቁጥሮችን እይ 🔐' የሚለውን በተን በመጫን ዝርዝሩን ማየት ይችላሉ። \n\n 3. የእጣ ቁጥር መያዝ አለመያዙን ቸክ ለማድረግ 'የእጣ ቁጥር ይፍትሹ ❓' የሚለውን በተን በመጫን ከዛም ቁጥሩን በመላክ ማየት ይችላሉ። \n\n 4. 'በስልክ ቁጥር ፈልግ 🔎' የሚለውን በተን በመጫን የተመዘገበ ደንበኛ መፈለግ ይችላሉ።`
  );
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
