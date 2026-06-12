const fs = require('fs');
const path = require('path');
const AddressConverter = require('./addressConverter');

const feedbackFilePath = path.join(__dirname, 'feedback.json');

if (!fs.existsSync(feedbackFilePath)) {
    console.log("\n✅ No feedback.json file found. There are no reported errors to check!");
    process.exit(0);
}

let feedbacks = [];
try {
    feedbacks = JSON.parse(fs.readFileSync(feedbackFilePath, 'utf8'));
} catch (e) {
    console.error("❌ Error reading or parsing feedback.json:", e.message);
    process.exit(1);
}

if (!Array.isArray(feedbacks) || feedbacks.length === 0) {
    console.log("\n✅ The feedback.json file is empty. No reported errors to check!");
    process.exit(0);
}

console.log("Loading dataset...");
const converter = new AddressConverter();
converter.loadData(
    path.join(__dirname, 'data/donvi_tinhthanh.json'),
    path.join(__dirname, 'data/simplified_json_generated_data_vn_units.json')
);
console.log("Dataset loaded successfully!\n");

console.log(`Checking ${feedbacks.length} reported address feedback(s)...`);
console.log("==================================================");

let failedCount = 0;
let passedCount = 0;

feedbacks.forEach((entry, index) => {
    try {
        const actual = converter.convertAddress(entry.input);
        const isCorrect = actual.toLowerCase() === entry.expected.toLowerCase();
        
        console.log(`\n[#${index + 1}] Feedback ID: ${entry.id}`);
        console.log(`Input:    "${entry.input}"`);
        console.log(`Expected: "${entry.expected}"`);
        console.log(`Actual:   "${actual}"`);
        
        if (isCorrect) {
            console.log("Status:   ✅ PASSED (Code parses it correctly now)");
            passedCount++;
        } else {
            console.log("Status:   ❌ FAILED (Algorithm needs update)");
            failedCount++;
        }
    } catch (err) {
        console.log(`\n[#${index + 1}] Feedback ID: ${entry.id}`);
        console.log(`Input:    "${entry.input}"`);
        console.log(`Expected: "${entry.expected}"`);
        console.log(`Error:    💥 ${err.message}`);
        console.log("Status:   ❌ FAILED (Algorithm threw error)");
        failedCount++;
    }
});

console.log("\n==================================================");
console.log("SUMMARY:");
console.log(`Total Feedbacks: ${feedbacks.length}`);
console.log(`✅ Passed:        ${passedCount}`);
console.log(`❌ Failed:        ${failedCount}`);

if (failedCount > 0) {
    console.log("\n❌ Action required: Please review and fix the failing addresses in the code!");
    process.exit(1);
} else {
    console.log("\n✅ All reported feedbacks are passing! The code is fully aligned.");
    process.exit(0);
}
