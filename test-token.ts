import fetch from "node-fetch";

async function run() {
  const igToken = "EAARPlCb1FaABRaytKgmRKSyCSkBS4uoC708V6rosa3a4Bmehq9esEyxukN1aT2gtlZAOZAna0U2mydGznbL4egiZCeKYseOlHkPHoZAWrhbQuMg6Sa4uJoHnoqt3KFdZBJZCLlI7fZAfDXMD88auwZBMWjhuum24mmO8MIsZBtGE6Q2ZAIURYfW8F0EN9llLh6IvMOY5xNETd99ZBXRnUZCmIEJ0x08owOEK8PXnnM9hhHyTxo7OjdNtq5QsQg6X7TnykV2I5IJnOZAPv85mYbiPHpmcW";
  let m1 = await fetch(`https://graph.facebook.com/v19.0/me?fields=accounts&access_token=${igToken}`);
  console.log('me/accounts graph.facebook:', await m1.json());
  
  let m2 = await fetch(`https://graph.facebook.com/v19.0/me?fields=instagram_accounts&access_token=${igToken}`);
  console.log('me/instagram_accounts graph.facebook:', await m2.json());

  let m3 = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${igToken}`);
  let user = await m3.json();
  let m4 = await fetch(`https://graph.facebook.com/v19.0/${user.id}/accounts?access_token=${igToken}`);
  console.log('user/accounts:', await m4.json());
}

run();
