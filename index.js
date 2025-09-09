const TelegramBot = require("node-telegram-bot-api");
const mysql = require("mysql2/promise");
const fs = require("fs");
const token = "8260792818:AAG-MnHOaeqZmLkW4_Frl8CHwMhaz9EZ1ck";
// const CHAT_ID = "-1003059845988";

const CHAT_ID = "-1003038960718";
const bot = new TelegramBot(token, { polling: true });

const storageFile = "./message_ids.json";

// const pool = mysql.createPool({
//   host: "localhost",
//   user: "root",
//   password: "",
//   database: "mekina_eta",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "123456",
  database: "mekina_eta",
});

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
const PAGE_SIZE = 100;
let messageData = [];

if (fs.existsSync(storageFile)) {
  try {
    messageData = JSON.parse(fs.readFileSync(storageFile, "utf-8"));
    console.log("Loaded message data from storageFile.");
  } catch (err) {
    console.error("Failed to parse storage file, starting fresh.");
    messageData = [];
  }
}

function saveMessageData() {
  fs.writeFileSync(storageFile, JSON.stringify(messageData, null, 2));
}
const userStates = {};

async function sendNumbersWithPhones(chatId) {
  messageData = []; // reset

  const [rows] = await pool.query(
    "SELECT number, phone FROM taken ORDER BY number ASC"
  );
  const lines = rows.map(
    (r) =>
      `${r.number}👉${r.phone && r.phone.trim() !== "" ? r.phone + "🙏" : ""}`
  );
  const chunks = chunkArray(lines, 200);

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].join("\n");
    try {
      const sent = await bot.sendMessage(chatId, text);
      messageData.push({ id: sent.message_id, text });
      saveMessageData();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      console.error("Failed to send chunk", i, err);
    }
  }

  console.log("All chunks sent!");
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  delete userStates[chatId];

  // Define 4 buttons
  const options = {
    reply_markup: {
      keyboard: [
        ["አዲስ ሰው መመዝገብ 👤", "የተያዙ ቁጥሮችን እይ 🔐"],
        ["የእጣ ቁጥር ይፍትሹ ❓"],
        ["ስልክ ቁጥር ማስትካክያ ✎", "ስልክ ቁጥር ያጥፉ ❌"],
        ["እርዳታ ⓘ"],
      ],
      resize_keyboard: true, // makes buttons smaller
      one_time_keyboard: false, // keep keyboard open
    },
  };

  bot.sendMessage(chatId, "👇", options);
});

async function sendPage(chatId, page, numbers) {
  const start = page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageNumbers = numbers.slice(start, end);

  if (pageNumbers.length === 0) {
    return bot.sendMessage(chatId, "የተያዙ ቁጥሮች የሉም።");
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
// editMessage(0, false);
async function editMessage(n, s) {
  if (messageData.length === 0) {
    try {
      await sendNumbersWithPhones(CHAT_ID);
    } catch (err) {
      console.error(err);
      bot.sendMessage(CHAT_ID, "❌ Failed to send numbers.");
    }
    return;
  }

  try {
    const [rows] = await pool.query(
      "SELECT number, phone FROM taken ORDER BY number ASC"
    );

    const lines = rows.map(
      (r) =>
        `${r.number}👉${r.phone && r.phone.trim() !== "" ? r.phone + "🙏" : ""}`
    );

    const chunks = chunkArray(lines, 200);

    for (let i = 0; i < chunks.length; i++) {
      const newText = chunks[i].join("\n");

      if (messageData[i].text !== newText) {
        try {
          await bot.editMessageText(newText, {
            chat_id: CHAT_ID,
            message_id: messageData[i].id,
          });
          if (s) {
            bot.sendMessage(CHAT_ID, `እጣ ቁጥር ${n} ተመዝግቧል። መልካም ዕድል!`);
          } else {
            // bot.sendMessage(CHAT_ID, `እጣ ቁጥር ${n} ተለቋል።`);
          }

          messageData[i].text = newText;
          saveMessageData(); // persist after each edit
        } catch (err) {
          if (
            err.response &&
            err.response.body &&
            err.response.body.description &&
            err.response.body.description.includes("message to edit not found")
          ) {
            console.warn("⚠️ Message deleted. Resetting all messages...");

            // delete all old messages (just in case some remain)
            for (const msg of messageData) {
              try {
                await bot.deleteMessage(CHAT_ID, msg.id);
              } catch (delErr) {
                console.error("Failed to delete old message:", delErr.message);
              }
            }

            // reset state
            messageData = [];
            saveMessageData();

            // send fresh messages
            await sendNumbersWithPhones(CHAT_ID);
            console.log(s, typeof s);
            if (s) {
              bot.sendMessage(CHAT_ID, `እጣ ቁጥር ${n} ተመዝግቧል። መልካም ዕድል!`);
            } else {
              // bot.sendMessage(CHAT_ID, `እጣ ቁጥር ${n} ተለቋል።`);
            }
            return;
          } else {
            console.error("Unexpected error editing message:", err.message);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error("❌ editMessage failed:", err);
    bot.sendMessage(CHAT_ID, "❌ Failed to refresh messages.");
  }
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "a") {
    console.log("group chat id", chatId);
  }

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
  } else if (text === "ስልክ ቁጥር ማስትካክያ ✎") {
    userStates[chatId] = { step: "awiaitngEditNumber" };
    bot.sendMessage(chatId, "🔎 እባክዎ የእጣ ቁጥሩን ይላኩልን");
    return;
  } else if (text === "መረጃ 📌") {
    delete userStates[chatId];
    console.log("merejajaja");
    getInfo(chatId);
    return;
  } else if (text === "እርዳታ ⓘ") {
    delete userStates[chatId];
    getHelp(chatId);
    return;
  } else if (text === "ስልክ ቁጥር ያጥፉ ❌") {
    userStates[chatId] = { step: "awaitingDeleteUser" };

    bot.sendMessage(chatId, "❌ እባክዎ የእጣ ቁጥሩን ይላኩልን።");
    return;
  }

  // Step 2: Validate phone
  if (userStates[chatId]?.step === "awaitingPhone") {
    // const phoneRegex = /^(09|07)\d{7}$/;
    // if (!phoneRegex.test(text)) {
    //   bot.sendMessage(
    //     chatId,
    //     "❌ የተሳሳተ ስልክ ቁጥር። እባክዎ 09 ወይም 07 የሚጀምር 10 አሃዝ ያስገቡ።"
    //   );
    //   return;
    // }
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
    console.log("Registered User:");
    await createUser(userStates[chatId], chatId);
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

  if (userStates[chatId]?.step === "awaitingDeleteUser") {
    // const number = parseInt(text, 10);
    const number = text;

    if (isNaN(number) || number < 1 || number > 2000) {
      bot.sendMessage(
        chatId,
        "❌ ትክክለኛ ቁጥር አልሰጠም። እባክዎ 1 - 2000 መካከል ቁጥር ያስገቡ 🔢"
      );
    } else {
      try {
        const [rows] = await pool.query(
          "update taken set phone = ?,status=0 where number = ?",
          ["", Number(text)]
        );
        editMessage(0, false);
      } catch (error) {
        console.log(error);
      }
      delete userStates[chatId];
      return;
    }

    delete userStates[chatId];
    return;
  }

  if (userStates[chatId]?.step === "awiaitngEditNumber") {
    // const number = parseInt(text, 10);
    const number = text;

    if (isNaN(number) || number < 1 || number > 2000) {
      bot.sendMessage(
        chatId,
        "❌ ትክክለኛ ቁጥር አልሰጠም። እባክዎ 1 - 2000 መካከል ቁጥር ያስገቡ 🔢"
      );
    } else {
      userStates[chatId] = { step: "awaitingeditphone" };
      userStates[chatId].number = text;
      bot.sendMessage(chatId, "ስልክ ቁጥር ይላኩልን። 🔢");
      return;
    }

    delete userStates[chatId];
    return;
  }

  if (userStates[chatId]?.step === "awaitingeditphone") {
    // const number = parseInt(text, 10);
    const number = text;

    const n = userStates[chatId].number;
    try {
      const [rows] = await pool.query(
        "update taken set phone = ? where number = ?",
        [text, n]
      );
      editMessage(0, false);
      bot.sendMessage(chatId, "ስልክ ቁጥር በሚገባ ተደልቷል።");
    } catch (error) {
      console.log(error);
    }

    delete userStates[chatId];
    return;
  }

  delete userStates[chatId];
  return;
});

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

async function createUser(data, chatId) {
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

    // await pool.query(
    //   "Update numbers set selectedNumbers = json_array_append(selectedNumbers, '$', ?) where id = ?",
    //   [data.chosenNumber, 1]
    // );

    const [a] = await pool.query(
      "select phone,status from taken where number = ?",
      [data.chosenNumber]
    );
    if (a[0].phone === "" && a[0].status === 0) {
      await pool.query(
        "Update taken set phone = ?, status = 1 where number = ?",
        [data.phone, data.chosenNumber]
      );
      bot.sendMessage(chatId, "🎉 በትክክል ተመዝግበዋል። ✅");
    } else {
      bot.sendMessage(chatId, " የእጣ ቁጥር ተይዟል ");
    }

    setTimeout(() => {
      editMessage(data.chosenNumber, true);
    }, 150);

    // console.log("✅ Game inserted successfully");
  } catch (err) {
    console.error("❌ Error inserting game:", err.message);
  }
}

async function getAllSelected() {
  try {
    // const [rows] = await pool.query(
    //   "select selectedNumbers from numbers where id = 1"
    // );

    const [n] = await pool.query("select number from taken where status = 1");

    console.log(n);

    if (n.length > 0) {
      return n.map((item) => item.number);
    } else {
      return false;
    }
  } catch (err) {}
}
async function ifNumberIsSelected(n) {
  try {
    // const [rows] = await pool.query(
    //   "select selectedNumbers from numbers where id = 1"
    // );

    const [na] = await pool.query(
      "select * from taken where number = ?  AND status = 1",
      [n]
    );
    if (na.length > 0) {
      return true;
    } else {
      return 0;
    }
  } catch (err) {
    console.log(err);
  }
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
    const [u] = await pool.query("SELECT COUNT(*) AS total FROM user");
    const users = u[0].total;
    console.log("asdasdasdasd", users);
    bot.sendMessage(chatId, "የተመዘገቡ ደንበኞች፡ " + users);
  } catch (err) {}
}

function getHelp(chatId) {
  bot.sendMessage(
    chatId,
    `የቦት አጠቃቀም \n\n1. አዲስ ሰው መመዝገብ \n\n 'አዲስ ሰው መመዝገብ 👤' ሚለውን በተን ከተጫኑ በኋላ የሚመዘገበውን ሰው ስልክ ቁጥር ላኩ። ከዛ በኋላ የመረጡትን ቁጥር ይላኩ። \n\n 2. የተያዙ ቁጥሮችን ለማየት 'የተያዙ ቁጥሮችን እይ 🔐' የሚለውን በተን በመጫን ዝርዝሩን ማየት ይችላሉ። \n\n 3. የእጣ ቁጥር መያዝ አለመያዙን ቸክ ለማድረግ 'የእጣ ቁጥር ይፍትሹ ❓' የሚለውን በተን በመጫን ከዛም ቁጥሩን በመላክ ማየት ይችላሉ። \n\n 4. 'በስልክ ቁጥር ፈልግ 🔎' የሚለውን በተን በመጫን የተመዘገበ ደንበኛ መፈለግ ይችላሉ።`
  );
}

async function deleteUser(phone) {
  try {
    // 1. Get the user row
    const [rows] = await pool.query("SELECT * FROM user WHERE phone = ?", [
      phone,
    ]);

    if (rows.length === 0) {
      return { success: false, message: "ስልክ ቁጥር አልተገኘም። እባክዎ እንደገና ይሞክሩ።" };
    }

    const numbers = rows[0].number;
    const arr = numbers.split(",").map((num) => Number(num.trim()));

    // 2. Loop over numbers and update selectedNumbers
    for (const n of arr) {
      // const [selected] = await pool.query(
      //   "SELECT selectedNumbers FROM numbers WHERE id = 1"
      // );
      // if (selected.length > 0) {
      //   const a = JSON.parse(selected[0].selectedNumbers).sort();
      //   const updatedNumbers = a.filter((num) => num !== n);

      // await pool.query(
      //   "UPDATE numbers SET selectedNumbers = ? WHERE id = 1",
      //   [JSON.stringify(updatedNumbers)]
      // );
      await pool.query(
        "UPDATE taken SET phone = '',status=0 WHERE number = ?",
        [n]
      );
      console.log("deleted");
      // }
    }

    // 3. Delete user
    await pool.query("DELETE FROM user WHERE phone = ?", [phone]);
    editMessage(0, false);
    // ✅ Return success
    return { success: true, message: "ስልክ ቁጥር በሚገባ ተደልቷል።" };
  } catch (err) {
    console.error("Error:", err);
    // ❌ Return failure with error message
    return { success: false, message: err.message };
  }
}
