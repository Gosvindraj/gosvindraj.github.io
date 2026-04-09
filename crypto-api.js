const convertBtn = document.querySelector(".convert_button");

convertBtn.addEventListener("click", function () {
  Promise.all([
    fetch("https://api.exchangerate-api.com/v4/latest/USD").then((res) =>
      res.json()
    ),
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    ).then((res) => res.json()),
  ])
    .then(([myrRate, btcPrice]) => {
      const usdMyrRate = document.getElementById("rate_myr");
      usdMyrRate.textContent = myrRate.rates.MYR;
      const btcUsdPrice = document.getElementById("btc_price");
      btcUsdPrice.textContent = btcPrice.bitcoin.usd;
      const btcMyrPrice = document.getElementById("btc_price_myr");
      btcMyrPrice.textContent = `BTC Price in MYR: RM ${
        btcPrice.bitcoin.usd * myrRate.rates.MYR
      }`;
    })
    .catch((error) => {
      console.error("Error:", error);
      document.getElementById("rate_myr").textContent = "Error loading rate";
      document.getElementById("btc_price").textContent = "Error loading price";
    });
});
