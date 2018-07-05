+++
date = "2017-03-22T18:37:06+03:00"
draft = false
title = "VPN это просто"

+++

В статье использован материал из "[Using TUN/TAP in go or how to write VPN](https://nsl.cz/using-tun-tap-in-go-or-how-to-write-vpn/)"

Сейчас очень много говорят о VPN, мешсетях и других технологиях для анонимизации или создания защищенных соединений. К сожалению, я довольно далек от этой темы, но иногда нужно окунаться в неизвестную область - хорошая разминка для мозгов. 

Наверное, многие пользовались VPN(виртуальная приватная сеть), но не очень часто задумывались, как они реализованы изнутри. Если верить википедиии, то VPN это:

>Виртуальная частная сеть — обобщённое название технологий, позволяющих обеспечить одно или несколько сетевых соединений (логическую сеть) поверх другой сети (например, Интернет). 

Во-первых, технологий и способов создания приватных сетей довольно много. Они отличаются по степени защищенности, реализацией и назначением, типами и уровнями используемых протоколов.

Один из самых известных инструментов для создания VPN - это [OpenVPN](https://openvpn.net/). С его помощью можно настроить защищенные приватные сети.

Но в чем же сам принцип работы виртуальных сетей? Я попытаюсь объяснить это на простом примере.

### TUN/TAP

Для создания нашей супер простой виртуальной сети я буду использовать такую штуку, как TUN/TAP. Это виртуальные сетевые драйверы ядра системы. С их помощью можно эмулировать виртуальные сетевые карты. 

TAP работает аж на канальном уровне и эмулирует Ethernet устройство. TUN работает на сетевом уровне и с его помощью можно добраться до ip пакетов.

Для наших экспериментов достаточно TUN. Мы создадим виртуальное устройство с которым будем работать.

Для начала нам нужно создать два виртуальных сетевых устройства на компьютерах, которые мы собрались объединить в виртуальную сеть. 

У меня есть небольшой виртуальный сервер с ip `95.213.199.250`. Вторая машинка - это мой локальный компьютер с ip адресом `109.167.253.115`.

При создании виртуального сетевого устройства ему нужно задать ip адрес. На локальном компьютере это будет `192.168.9.11/24`, на виртуальном сервере `192.168.9.9/24`.

Как все это будет работать? Все довольно просто:

1. Мы отправляем пакет на локальной машине на TUN интерфейс `192.168.9.11`, например `echo "hello" > /dev/udp/192.168.9.11/4001`
2. Затем, наша программа, запущенная на той же машине, вычитывает данные из этого интерфейса и отправляет их на удаленные компьютер `95.213.199.250` через интернет.
3. На удаленной машине программа читает данные, присланные на `95.213.199.250` и записывает их в TUN интерфейс `192.168.9.9` на той же машине.
4. Теперь мы можем считать данные с `192.168.9.9`, например как-то так `netcat -lu 192.168.9.11 4001`

Внешне все выглядит, как будто мы работаем по локальной сети, хотя наши данные пересылаются через интернет. Данные можно зашифровать и добавить кучу разных плюшек. Но мы попытаемся реализовать только базовые вещи.

### Реализация

Начнем с создания виртуальных сетевых интерфейсов. Для этого мы будем использовать пакет [github.com/songgao/water](https://github.com/songgao/water) который представляет из себя отличную библиотеку для работы с TUN/TAP интерфейсом. Кроме этого, мы будем использовать программу `/sbin/ip` для настройки наших интерфейсов.

Создаем интерфейс:

```go
iface, err := water.NewTUN("")
if err != nil {
    log.Fatalln("Unable to allocate TUN interface:", err)
}
```

Теперь нам нужно настроить наш свежесозданный интерфейс

```bash
/sbin/ip link set dev tun0 mtu 1300
/sbin/ip addr add 192.168.9.10/24 dev tun0
/sbin/ip set dev tun0 up
```

Для того чтобы посылать и получать данные через интернет нам нужно создать UDP сокетов. Тут нет никаких хитростей, все прям как в мануле.

Один цикл используем для чтения из UDP и запись в виртуальный интерфейс

```go
buf := make([]byte, BUFFERSIZE)
for {
    // читаем, что нам прислали из интернета
    n, addr, err := lstnConn.ReadFromUDP(buf)
    // будем использовать для отладки
    header, _ := ipv4.ParseHeader(buf[:n])
    fmt.Printf("Received %d bytes from %v: %+v\n", n, addr, header)
    if err != nil || n == 0 {
        fmt.Println("Error: ", err)
        continue
    }
    // пишем в TUN интерфейс
    iface.Write(buf[:n])
}
```

Второй цикл используется для обратного - чтения из виртуального интерфейса и записи в UDP:

```go
packet := make([]byte, BUFFERSIZE)
for {
    // читаем данные из виртуального интерфейса
    plen, err := iface.Read(packet)
    if err != nil {
        break
    }

    header, _ := ipv4.ParseHeader(packet[:plen])
    fmt.Printf("Sending to remote: %+v (%+v)\n", header, err)
    // отправляем на удаленный адрес
    lstnConn.WriteToUDP(packet[:plen], remoteAddr)
}
```

Тут нужно уточнить, что у нас в переменных `remoteAddr`. У нас есть два флага:

```go
var (
    local  = flag.String("local", "", "Local tun interface IP/MASK like 192.168.3.3/24")
    remote = flag.String("remote", "", "Remote server (external) IP like 8.8.8.8")
)
```

`local` - это ip адрес виртуального интерфейса на локальном компьютере.
`remote` - внешний ip адрес удаленного компьютера, по которому будет происходит UDP соединение.

Для настройки интерфейса сделаем специальную функцию:

```go
func run(args ...string) {
    cmd := exec.Command("/sbin/ip", args...)
    cmd.Stderr = os.Stderr
    cmd.Stdout = os.Stdout
    cmd.Stdin = os.Stdin
    err := cmd.Run()
    if nil != err {
        log.Fatalln("error running /sbin/ip:", err)
    }
}
```

И использовать ее можно вот так:

```go
run("link", "set", "dev", iface.Name(), "mtu", MTU)
```

Обратите внимание, что у вас два бесконечных цикла. Чтобы все работало как надо, можно обернуть первый в go-рутину:

```go
go func() {
    buf := make([]byte, BUFFERSIZE)
    for {
        n, addr, err := lstnConn.ReadFromUDP(buf)
        header, _ := ipv4.ParseHeader(buf[:n])
        fmt.Printf("Received %d bytes from %v: %+v\n", n, addr, header)
        if err != nil || n == 0 {
            fmt.Println("Error: ", err)
            continue
        }
        iface.Write(buf[:n])
    }
}()
```

Пример запуска нашей программы на локальном компьютере:

```bash
sudo ./vpn -local="192.168.9.9/24" -remote=95.213.199.250
```

На удаленном компьютере:

```bash
sudo ./vpn -local="192.168.9.11/24" -remote=109.167.253.115
```

И на этом, в принципе, все. Программка получилась маленькая, но довольно хорошо иллюстрирующая концепцию работы VPN.

Для проверки отправим что ни будь через нашу виртуальную сеть. На локальном компьютере отправлю данные через UDP:

```
echo "hello" > /dev/udp/192.168.9.11/4001
```

На удаленном компьютере читаю из UDP:

```bash
netcat -lu 192.168.9.11 4001
hello
```

Ура! Данные передались, наша сеть работает. Полный код программы можно посмотреть на [github](https://github.com/horechek/vpn). 