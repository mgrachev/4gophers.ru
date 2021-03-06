+++
date = "2016-08-31T01:52:01+03:00"
draft = false
title = "Полнотекстовый поиск с Couchbase и Go"

+++

<p>Перевод статьи "<a href="http://blog.couchbase.com/2016/july/using-full-text-search-fts-with-couchbase-in-a-golang-application">Using Full Text Search (FTS) with Couchbase in a GoLang Application</a>"</p>

<p>Недавно я написал статью о использовании <a href="http://blog.couchbase.com/2016/july/using-full-text-search-fts-in-couchbase-with-the-nodejs-sdk">полнотекстового поиска (Full Text Search) в приложениях на Node.js</a>, в которой говорилось о использовании для реализации поиска Couchbase Server 4.5 и выше. Возможно вы уже знаете, что в Couchbase Server 4.5 появился полнотекстовый поиск(пока еще превью для разработчиков). За это отдельное спасибо ребятам из Couchbase, которые стараются быть открытыми, насколько это возможно. Теперь, вместо не очень производительных запросов по шаблону, можно использовать запросы по полнотекстовому индексу. Таким образом, необходимость использовать ElasticSearch или Solr становится не такой острой, конечно, если ваш бизнес не строится исключительно вокруг поиска.</p>

<p>Мы будем использовать пример из прошлой статьи, написанные на Node.js и постараемся переписать его на Go. Не переживайте, даже если вы не работали с Node.js, пример всеравно достаточно простой и понятный. В прошлой статье мы представили себе некоторый условный сценарий ранжирования резюме, в котором мы сканировали резюме соискателей по некоторым ключевым словам и давали им оценку. Продолжим двигаться в этом же направлении.</p>

<h3>Создаем новый проект</h3>

<p>Чтобы полностью разобраться в нашем примере, мы начнем с самого начала. Для работы нам понадобится установленный Go, а также сконфигурированный и запущенный <a href="http://developer.couchbase.com/server/?utm_source=blogs&amp;utm_medium=link&amp;utm_campaign=blogs">Couchbase Server</a> 4.5</p>

<p>Создаем новый проект. В моем случае проект будет находится в <code>$GOPATH/src/github.com/nraboy/cbfts/main.go</code>. Перед тем как окунуться в программирование, необходимо установить Couchbase Go SDK.</p>

<pre><code>go get github.com/couchbase/gocb
</code></pre>

<p>Почти все готово и мы уже вот-вот начнем писать код. Но нам еще нужно настроить необходимые индексы в Couchbase.</p>

<h3>Добавляем индекс для полнотекстового поиска</h3>

<p>Перед тем как начать пользоваться полнотекстовым поиском, необходимо создать специальный индекс. Это можно легко сделать с помощью административного интерфейса. Необходимо выбрать Indexes -> Full Text таб</p>

<p><img src="http://blog.couchbase.com/binaries/content/gallery/website/blogs/fts-create-index.gif" alt="" /></p>

<p>В этой секции можно кликнуть на "New Full Text Index" и выбрать бакет, к которому должен примениться этот индекс. Для нашего примера мы будем использовать бакет по умолчанию, а индекс будет называться "resume-search". Индекс в нашем примере имеет базовые настройки, если вам нужно больше подробностей, то можете <a href="http://developer.couchbase.com/documentation/server/current/fts/fts-creating-indexes.html#topic_ksl_wwk_1v">найти их в документации</a>.</p>

<p>После создания индекса, нажмите кнопку обновления. Теперь можно проверить работу индекса через все тот же дашборд.</p>

<h3>Модель данных</h3>

<p>Теперь окинем взглядом наду модель данных. Каждый документ представляет собой резюме соискателя. Если проявить немного фантазии, то можно представить что наши данные выглядят как-то так:</p>

<pre><code>{
    "firstname": "Nic",
    "lastname": "Raboy",
    "skills": [
        "java",
        "node.js",
        "golang",
        "nosql"
    ],
    "summary": "I am a cool guy working on cool things",
    "social": {
        "github": "https://www.github.com/nraboy",
        "twitter": "https://www.twitter.com/nraboy"
    },
    "employment": [
        {
            "employer": "Couchbase",
            "title": "Developer Advocate",
            "location": "San Francisco"
        }
    ]
}
</code></pre>

<p>В этом документе есть информация о скилах, опыте работы, социальных аккаунтах соискателя. Конечно, в реальной жизни полей может быть намного больше, но для нашего примера это вполне достаточно.</p>

<p>Самое важное, на что нам нужно обратить внимание, это текст "Developer Advocate". Мы напишем Go приложение, которое будет выполнять поиск именно по этой фразе.</p>

<h3>Разработка приложения</h3>

<p>Так как наше приложение очень маленькое, то весь код поместиться в одном единственном файле main.go. Начнем с импортирования всех необходимых зависимостей:</p>

<pre><code>package main

import (
    "encoding/json"
    "fmt"

    "github.com/couchbase/gocb"
    "github.com/couchbase/gocb/cbft"
)
</code></pre>

<p>Обратите внимание, что мы импортировали пакет для работы с JSON. Также, нам понадобятся пакеты для работы с Couchbase и Couchbase FTS.</p>

<p>Данные, которые мы будем собирать, весьма специфичны. Поэтому стоит создать еще одну структуру данных. Назовем эту структуру  <code>FtsHit</code> и выглядеть она будет вот так:</p>

<pre><code>type FtsHit struct {
    ID    string  `json:"id,omitempty"`
    Score float64 `json:"score,omitempty"`
}
</code></pre>

<p>Мы будем сохранять каждый id и оценку всех документов которые мы получили через поиск. Каждое поле структуры имеет свой специальный JSON тег, которое говорит, что поле нужно игнорировать если оно пустое.</p>

<p>Теперь напишем немного магического кода в main функции:</p>

<pre><code>func main() {
    cluster, _ := gocb.Connect("couchbase://localhost")
    bucket, _ := cluster.OpenBucket("default", "")
    query := gocb.NewSearchQuery("resume-search",
            cbft.NewMatchQuery("developer advocate"))

    result, _ := bucket.ExecuteSearchQuery(query)

    var ftsHit *FtsHit
    for _, hit := range result.Hits() {
        ftsHit = &amp;FtsHit{ID: hit.Id, Score: hit.Score}
        jsonHit, _ := json.Marshal(&amp;ftsHit)
        fmt.Println(string(jsonHit))
    }
}
</code></pre>

<p>Перед тем как выполнять поиск, нам нужно установить соединение с Couchbase и открыть бакет. В нашем примере используется локальная нода и бакет по умолчанию. После подключения к базе, мы можем запускать поисковые запросы по ранее созданному индексу "resume-search". Этот запрос ищет текст "developer advocate" во всех документах и во всех полях документа. Если искомый текст будет найден в любом месте документа, то мы засчитываем хит(hit).</p>

<p>После того как выполниться запрос, мы выполним итерацию по всем результатам и, с помощью пакета для работы с JSON, распарсим каждый в структуру <code>FtsHit</code>.</p>

<h3>Пока все хорошо, не так ли?</h3>

<p>Представим, что теперь вам нужен чуть более специфический поиск. Конечно, хорошо иметь возможность искать по всему документу, но мы хотим искать только по списку прошлых мест работы соискателя.</p>

<p>Для этого нам достаточно немного уточнить наш <code>SearchQuery</code>:</p>

<pre><code>query := gocb.NewSearchQuery("resume-search", 
    cbft.NewMatchQuery("developer advocate").Field("employment.title"))
</code></pre>

<p>Пожалуй оставим этот пример простым, хотя есть еще тысяча замечательных вещей, которые нам дает полнотекстовый поиск. Вы можете сделать ваш запрос более специфичным или добавить больше уточнений в ваш запрос. Больше сведений о полнотекстовом поиске можно <a href="http://developer.couchbase.com/documentation/server/4.5/sdk/go/full-text-searching-with-sdk.html">почерпнуть из документации</a>.</p>

<h3>Заключение</h3>

<p>Мы рассмотрели как можно быстро начать использовать полнотекстовый поиск Couchbase в приложениях на Go. Полнотекстовый поиск позволяет находить документы быстрее чем использование кучи различных масок.</p>
