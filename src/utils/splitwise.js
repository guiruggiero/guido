// Import
import {createRetryClient} from "./axiosClient.js";

// Initialize Splitwise client
const splitwiseClient = createRetryClient({
    baseURL: "https://secure.splitwise.com/api/v3.0",
    headers: {"Authorization": `Bearer ${process.env.SPLITWISE_API_KEY}`},
});

// Splitwise error checker
const checkSplitwiseError = (expenseData) => {
    const {error, errors} = expenseData;

    if (error) throw new Error(`Splitwise API: ${error}`); // {error: ""}

    if (errors && Object.keys(errors).length > 0) { // {errors: {base: [""]}}
        const errorMessage = Object.values(errors).flat().join(", ");
        throw new Error(`Splitwise API: ${errorMessage}`);
    }
};

// Creator for solo expenses
export const createSoloExpense = async (description, amount, currency, details = "") => {
    const fullDetails = [details, "Created with GuiDo"].filter(Boolean).join("\n\n");

    const res = await splitwiseClient.post("/create_expense", {
        cost: amount.toFixed(2),
        description,
        details: fullDetails,
        currency_code: currency,
        group_id: 0,
        split_equally: true,
    });
    checkSplitwiseError(res.data);
    return res;
};