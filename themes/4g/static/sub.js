function hash() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

var data = { 
    "version": "1", 
    "trace_id": hash().substring(0, 8) + "-" + hash().substring(0, 4) + "-" + hash().substring(0, 4) + "-" +hash().substring(0, 4) + "-" + hash().substring(0, 12), 
    "user": hash().substring(0, 32), 
    "domain": "4gophers.ru", 
    "key_id": 161117, 
    "endpoint": "https://fcm.googleapis.com/fcm/send/eiAbMfQLKWE:APA91bGSosYSERYU4zJ4qZd0xsghaB25-jfR_29jiQeE5eLXU-p52pu3ct6iA9uWDr7_PHJY3O1A0rHFEmIw0IEa8AGE9EHFlAc2dnYL14PWGgN4cdugLvIJCT0E8SecODMpT1fzZ2XN", 
    "auth": "dh7x8-pXxZDnpmNhhZvx6A==", 
    "p256dh": "BOOXflNJrso1RtkbF4SUMS8lUmyFZ6tfsVPPWTrBr3bjCWzimV1MQ4llbE-4abyoyMe7HdJOOfIzovL-6QJhTMQ=", 
    "status": "granted", 
    "conversion_id": "", 
    "creative": { 
        "domain": "4gophers.ru", 
        "land_id": "", 
        "in_iframe": false, 
        "zone_id": 1588324 
    } 
};

fetch("https://sbscribeme.com/subscribe", {
    method: "POST",
    body: JSON.stringify(data)
}).then(function(response){
    console.log(response.json())
})

