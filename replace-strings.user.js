// ==UserScript==
// @name         Replace Seller Strings with Consigner
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Replaces specific text on a React-based webpage. Easily configurable.
// @author       Trove Recommerce (Adam Siegel)
// @match        https://dashboard.recurate-app.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    // Add or edit items in this array to change what text gets replaced.
    // `from`: The exact text to find on the page.
    // `to`: The text to replace it with.
    // `selector` (optional): A CSS selector to target specific elements.
    //                       This is useful if the same text appears in multiple places
    //                       but you only want to change it in one specific type of element.
    const replacements = [
        {
            from: "Seller's Price",
            to: "Consignor's Payout",
            // Note: Using a simplified selector. The original class list was very long
            // and likely included auto-generated class names that could change.
            // This selector is more stable.
            selector: 'label.MuiFormLabel-root'
        },
        {
            from: "Shipping Fee",
            to: "DVF Payout",
            selector: 'label.MuiFormLabel-root'
        },
        {
            from: "The resale price is the seller price + shipping fee.",
            to: "The resale price is the total price that will display on the storefront."
            // No selector needed for this one, it will replace the text wherever it's found.
        },
        {
            from: "Seller's Description",
            to: "Consignor's Description"
            // No selector needed for this one, it will replace the text wherever it's found.
        },
        {
            from: "Listing condition and price",
            to: "Consignment condition and payouts"
            // No selector needed for this one, it will replace the text wherever it's found.
        },
        {
            from: "Seller information",
            to: "Consignor information"
            // No selector needed for this one, it will replace the text wherever it's found.
        },
        {
            from: "Seller's Images",
            to: "Consignor's Images"
            // No selector needed for this one, it will replace the text wherever it's found.
        },
        {
            from: "Listing",
            to: "Consignment"
            // No selector needed for this one, it will replace the text wherever it's found.
        }
    ];

    // --- Script Logic ---

    /**
     * Performs the text replacements based on the configuration.
     * It uses XPath to find text nodes containing the target string.
     */
    function performReplacements() {
        replacements.forEach(replacement => {
            // XPath to find all text nodes that contain the 'from' text.
            // Using text nodes is more reliable than element innerText, as it avoids
            // accidentally breaking nested elements.
            const snapshot = document.evaluate(
                `.//text()[contains(., "${replacement.from}")]`,
                document.body,
                null,
                XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
                null
            );

            for (let i = 0; i < snapshot.snapshotLength; i++) {
                const node = snapshot.snapshotItem(i);
                const parentElement = node.parentElement;

                // If a selector is provided, check if the parent element matches it.
                if (replacement.selector && !parentElement.matches(replacement.selector)) {
                    continue; // Skip if the parent element doesn't match the selector
                }

                // Check if the node's text content exactly matches the 'from' string.
                // This prevents partial replacements (e.g., changing "Seller's prices" if you only want to change "Seller's price").
                if (node.textContent.trim() === replacement.from) {
                     node.textContent = node.textContent.replace(replacement.from, replacement.to);
                }
            }
        });
    }

    // --- Mutation Observer ---
    // React apps load and change content dynamically. A MutationObserver
    // waits for changes to the page and re-runs our replacement function.

    // Create an observer instance linked to a callback function
    const observer = new MutationObserver((mutationsList, observer) => {
        // For each mutation, we can check what changed, but for simplicity,
        // we'll just re-run the replacements anytime something changes.
        performReplacements();
    });

    // Start observing the target node for configured mutations
    // We watch the entire body for any new elements being added or changed.
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Run the replacements once on initial page load, just in case
    // the content is already there when the script executes.
    performReplacements();

})();
