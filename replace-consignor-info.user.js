// ==UserScript==
// @name         Replace DVF Info with Original Consignor Info
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Replaces placeholder text with the seller's email from a network request.
// @author       Trove Recommerce (Adam Siegel)
// @match        https://dashboard.recurate-app.com/dashboard/product/listings/*
// @grant        GM_log
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const targetSelector = 'p[data-testid="seller-email"]';
    const checkInterval = 200; // Check every 200 milliseconds
    // ---------------------

    let dynamicReplacementText = null; // This will hold the email we find.

    /**
     * This function intercepts network requests to find the one containing the seller's email.
     * It works by replacing the browser's default 'fetch' function with our own version.
     */
    const interceptFetch = () => {
        const originalFetch = unsafeWindow.fetch; // Store the original fetch function

        // Overwrite the global fetch function
        unsafeWindow.fetch = function(...args) {
            // Let the original fetch do its job, and capture the promise it returns
            const promise = originalFetch.apply(this, args);

            // Tap into the promise to inspect the response
            promise.then(response => {
                // We only care about requests for the 'core' data
                if (response.url.includes('/core')) {
                    // Clone the response so we can read it without interfering with the page's code
                    response.clone().json().then(data => {
                        try {
                            // Navigate through the JSON to find the email
                            if (data && data.data && Array.isArray(data.data.history.listings) && data.data.history.listings.length > 0) {
                                const lastHistoryItem = data.data.history.listings[data.data.history.listings.length - 1];
                                if (lastHistoryItem && lastHistoryItem.seller_info && lastHistoryItem.seller_info.seller_email) {
                                    const foundEmail = lastHistoryItem.seller_info.seller_email;
                                    const foundFirstName = lastHistoryItem.seller_info.seller_first_name;
                                    const foundLastName = lastHistoryItem.seller_info.seller_last_name;
                                    const foundAddress1 = lastHistoryItem.seller_info.seller_address_line1;
                                    const foundAddress2 = lastHistoryItem.seller_info.seller_address_line2;
                                    const foundCity = lastHistoryItem.seller_info.seller_city;
                                    const foundState = lastHistoryItem.seller_info.seller_state;
                                    const foundPostal = lastHistoryItem.seller_info.seller_postal;
                                    const foundPhone = lastHistoryItem.seller_info.seller_phone;
                                    GM_log('Found seller info from network request. Email: ' + foundEmail + ' Name: ' + foundFirstName + ' ' + foundLastName + ' Address: ' + foundAddress1);
                                    dynamicReplacementText = "Original consignor: " + foundEmail; // Store the found email
                                }
                            }
                        } catch (e) {
                            GM_log('Error parsing "core" JSON or finding email:', e);
                        }
                    });
                }
            });

            // Return the original promise so the website functions normally
            return promise;
        };
        GM_log('Fetch interceptor is active.');
    };

    /**
     * This function runs continuously to update the text on the page once
     * the dynamic email has been found by the fetch interceptor.
     */
    const applyTextReplacement = () => {
        setInterval(() => {
            // Only proceed if we have found the email from the network request
            if (dynamicReplacementText === null) {
                return;
            }

            const targetElement = document.querySelector(targetSelector);

            // If we find the target element AND its text is not already our dynamic text...
            if (targetElement && targetElement.textContent !== dynamicReplacementText) {
                GM_log(`Element found with text "${targetElement.textContent}". Replacing with "${dynamicReplacementText}".`);
                targetElement.textContent = dynamicReplacementText;
            }
        }, checkInterval);
    };

    // --- SCRIPT EXECUTION ---
    GM_log('Dynamic script starting.');
    interceptFetch(); // Start listening for network requests immediately
    applyTextReplacement(); // Start the loop that will apply the text when ready

})();
