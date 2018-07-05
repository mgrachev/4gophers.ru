self.addEventListener('push', function(event) {
    console.log('push', event);

    var data = event.data.json();
    var url = data.options.data.url.replace("http://","//");

    console.log(url);

    var save = "/scrooge/save/" + encodeURIComponent(url)

    fetch(save)
  });