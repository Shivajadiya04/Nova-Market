const { tool } = require("@langchain/core/tools")
const { z } = require("zod")
const axios = require("axios")
const { serviceUrl } = require("../config/internal")

const HTTP_TIMEOUT_MS = 10000;

// Tool failures are returned to the model as text so it can tell the user, instead of crashing the chat
const describeError = (err) => err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || err.message;

const searchProduct = tool(async ({ query, token }) => {

    console.log("searchProduct called with query:", query)

    try {
        const response = await axios.get(`${serviceUrl('PRODUCT_SERVICE_URL')}/api/products?q=${encodeURIComponent(query)}`, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            timeout: HTTP_TIMEOUT_MS
        })

        return JSON.stringify(response.data)
    } catch (err) {
        return `Product search failed: ${describeError(err)}`
    }

}, {

    name: "searchProduct",
    description: "Search for products based on a query",
    schema: z.object({
        query: z.string().describe("The search query for products")
    })
})


const addProductToCart = tool(async ({ productId, qty = 1, token }) => {

    try {
        await axios.post(`${serviceUrl('CART_SERVICE_URL')}/api/cart/items`, {
            productId,
            qty
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            },
            timeout: HTTP_TIMEOUT_MS
        })

        return `Added product with id ${productId} (qty: ${qty}) to cart`
    } catch (err) {
        return `Could not add product ${productId} to the cart: ${describeError(err)}`
    }


}, {
    name: "addProductToCart",
    description: "Add a product to the shopping cart",
    schema: z.object({
        productId: z.string().describe("The id of the product to add to the cart"),
        qty: z.number().describe("The quantity of the product to add to the cart").default(1),
    })
})


module.exports = { searchProduct, addProductToCart }
