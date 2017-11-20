var app = require('express')();
var http = require('http').Server(app);
var cons = require('consolidate'); // template engine

app.engine('html', cons.swig);
// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

var io = require('socket.io')(http);
var bodyParser = require('body-parser');
var multer  = require('multer'); // file upload multipart
var fs = require('fs'); // file system

var expressSession = require('express-session');
var cookieParser = require('cookie-parser'); // session stored in cookie
var crypto = require('crypto'); // sha256

var mysql      = require('mysql');
var pool = mysql.createPool({
    host     : 'localhost',
    database : 'chat',
    user     : 'root',
    password : 'qwerty'
});

app.use(require('express').static(__dirname + '/static'));
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())
app.use(multer({ dest: __dirname + '/static/uploads/'}))
app.use(cookieParser());
app.use(expressSession({secret: '1234567890_QWERTY', resave: false, saveUninitialized: true}));

var url = "http://localhost:3000";

var users = [];

app.post('/', function(req, res){
    
    var password = crypto.createHash('sha256').update(req.body.password).digest('base64');
    var query = "SELECT * FROM `user` WHERE `email`='" + req.body.email + "' and `password`='" + password + "'";
    
    pool.query(query, function(err, rows, fields) {
        if (err) throw err;
        if(rows && rows.length != 0){
            req.session.user = rows[0];
            if(users.indexOf(rows[0]) == -1) users.push(rows[0]);
            res.redirect('/public');
        }
        else res.redirect('/');
    });

});

app.post('/registeration', function(req, res){
    var username = req.body.username;
    var email = req.body.email;
    var password = crypto.createHash('sha256').update(req.body.password).digest('base64');
    var gender = req.body.gender;

    pool.query('INSERT INTO `user` SET ?', {username: username, email: email, password: password, gender: gender}, function(err, result) {
        if (err) throw err;

        res.redirect('/');
    });
});

app.get('/', function(req, res){
    if(req.session.user){
        res.render('public', {
            url: url,
            user: req.session.user,
        });
    }
    else res.render('login');
    //res.sendFile(__dirname + '/login.html');
});

app.get('/logout', function(req, res){
    
    for(var i=0; i<users.length; i++){
        if(users[i].id == req.session.user.id){
            users.splice(i, 1);
        }
    }
    
    req.session.user = null;
    
    // update online users
    io.emit('online users', users);
    
    res.redirect('/');
})


app.get('/public', function(req, res){
    if(req.session.user){
        res.render('public', {
            url: url,
            user: req.session.user,
        });
    }
    else res.redirect('/');
});

app.get('/date', function(req, res){
    if(req.session.user){
        res.render('date', {
            url: url,
            user: req.session.user,
        });
    }
    else res.redirect('/');
});

app.get('/adv', function(req, res){
    if(req.session.user){
        res.render('adv', {
            url: url,
            user: req.session.user,
        });
    }
    else res.redirect('/');
});

app.get('/edit', function(req, res){
    res.redirect('/');
});

app.get('/edit/:id', function(req, res){

    if(req.session.user && req.params.id == req.session.user.id){
        var query = "SELECT * FROM `user` WHERE `id`='" + req.params.id + "'";
    
        pool.query(query, function(err, rows, fields) {
            if (err) throw err;
            res.render('edit', {
                url: url,
                user: rows[0],
            });
        });
    }
    else res.redirect('/')
    
});

app.post('/edit', function(req, res){
    
    var id = req.body.userid;
    var username = req.body.username;
    var email = req.body.email;
    var gender = req.body.gender;
    var age = req.body.age;
    var greeting = req.body.greeting;
    
    var block = {};
    if(req.body.password)
    {
        password = crypto.createHash('sha256').update(req.body.password).digest('base64');
        if(req.files.avatar){
            block = {
                avatar: req.files.avatar.name,
                username: username, 
                email: email, 
                password: password, 
                gender: gender, 
                age: age, 
                greeting: greeting
            };
        }
        else {
            block = {
                username: username, 
                email: email, 
                password: password, 
                gender: gender, 
                age: age, 
                greeting: greeting
            };
        }
    }
    else {
        if(req.files.avatar){
            block = {
                avatar: req.files.avatar.name,
                username: username, 
                email: email, 
                gender: gender, 
                age: age, 
                greeting: greeting
            };
        }
        else {
            block = {
                username: username, 
                email: email, 
                gender: gender, 
                age: age, 
                greeting: greeting
            };
        }
    }
    
    pool.query("UPDATE `user` SET ? WHERE `id`='" + id + "'", block, function(err, result) {
        if (err) throw err;

        res.redirect('/edit/' + id);
    });
    
});

var rooms = ['public', 'meeting', 'ads'];
var usernames = {};

io.on('connection', function(socket){
    
    io.emit('online users', users);

    socket.on('chat', function(data){
        var dt = new Date();
        var time = dt.getHours() + ":" + dt.getMinutes() + ":" + dt.getSeconds();
        data.time = time;
        io.emit('chat', data);
    });
    
    socket.on('disconnect', function(data) {
        io.emit('online users', users);
    });
    
    // create private chat
    socket.on('create private chat', function(username, from_id, to_id){
        socket.join(from_id);
        io.emit('create private chat', username, from_id, to_id);
    })
    
    // private chat
    socket.on('private chat', function(data){
        io.sockets.in(data.from_id).emit('private_chat_handle', data.to_id, data.msg);
    })
    
    // ROOM
    socket.on('subscribe', function(room) { 
        socket.join(room); 
    })

    socket.on('unsubscribe', function(room) {
        socket.leave(room); 
    })
    
    socket.on('send', function(data) {
        io.sockets.in(data.room).emit('message', data);
    });
    
    
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});
