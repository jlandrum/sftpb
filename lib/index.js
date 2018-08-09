const config = require( '../package.json' )
const blessed = require( 'blessed' );
const { spawn, spawnSync } = require('child_process');
const editor = process.env['EDITOR'] || 'vi';
const Client = require('ssh2-sftp-client');
const sftp = new Client();
const path = require('path');
const fs = require('fs');

var rcwd = '.';
var remoteTree;
var params;

module.exports = () => {
  // globals
  const buttonStyle = {
    bg: 'blue',
    fg: 'white',
    focus: {
      bg: 'green'
    }
  };
  
  // Elements
  const screen = blessed.screen({
    smartCSR: true,
    background: 'white'
  });
  const status = blessed.text({
    width: '100%',
    height: 1,
    bottom: 1,
    content: `sftp v.${config.version}`,
    bg: 'black',
    fg: 'white',
    style: {
      bg: 'black',
      fg: 'white'
    }
  });
  const console = blessed.textbox({
    height: 1,
    bottom: 0,
    left: 0,
    right: 0,
    inputOnFocus: true,
    keys: true,
    mouse: true
  })
  const remote = blessed.list({
    label: 'Remote',
    width: '50%',
    top: 0, left: 0, bottom: 2,
    border: 'line',
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: {
      focus: {
        border: {
          fg: 'lightred'
        }
      },
      selected: {
        bg: 'lightred',
        fg: 'white'
      }
    }
  });
  const local = blessed.filemanager({
    label: 'Local',
    width: '50%',
    cwd: '.',
    top: 0, left: '50%', bottom: 2,
    border: 'line',
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: {
      focus: {
        border: {
          fg: 'lightred'
        }
      },
      selected: {
        bg: 'lightred',
        fg: 'white'
      }
    }
  });

  // Interaction
  console.on( 'submit', (data)=> { doCommand( data ); } );
  local.on( 'file', (file)=> { doFileAction( file, true ); } );
  remote.on( 'select', (l,index)=> {
    if (remoteTree[index].type == 'd') {
      rcd(`${rcwd}/${remoteTree[index].name}`);
    } else {
      doFileAction( remoteTree[index].name, false );
    }
  });
  local.refresh();

  // Add views
  screen.append( status );
  screen.append( console );
  screen.append( remote );
  screen.append( local );

  // Keys
  screen.key( ['C-c'], function( ch, key ) {
    return process.exit(0);
  });
  screen.key( [':'], function( ch, key ) {
    console.focus();
    console.setValue(ch);
    screen.render();
  });
  screen.key( ['up'], ( ch, key )=> { if ( status.focused ) { remote.focus(); } } );
  screen.key( ['right'], ( ch, key )=> { if (remote.focused) { local.focus(); } } );
  screen.key( ['left'], ( ch, key )=> { if (local.focused) { remote.focus(); } } );
  screen.key( ['escape'], ( ch, key )=> { status.focus(); } );
  screen.render();

  // Status will act as our root node
  status.focus();

  // Commands
  doCommand = function( action ) {
    switch (action[0]) {
      case ":":
        doColonCommand(action.substring(1));
    }
  }

  doColonCommand = function( cmd ) {
    var args = cmd.split(' ');
    var action = args[0];
    switch (action) {
      case "q":
      case "quit":
      case "exit":
        return process.exit(0);
        break;
      case "l":
      case "local":
        local.focus();
        break;
      case "r":
      case "remote":
        remote.focus();
        break;
      case "c":
      case "connect":
        connect( args );
        break;
      case "d":
      case "disconnect":
        sftp.end();
        break;
      default:
        setStatus( `Unknown command: ${action}` );
        break;
    }
    console.setValue("");
  }

  setStatus = function( st ) {
    status.setContent( blessed.parseTags(st) );
    screen.render();
  }
 
  doFileAction = function ( file, local ) {
    var box = blessed.form({
      top: 'center',
      left: 'center',
      width: '50%',
      height: '50%',
      shadow: true,
      mouse: true,
      shrink: true,
      draggable: true,
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      content: ` How would you like to open ${file}?`,
      border: 'line'
    });
    blessed.text({
      parent: box,
      shrink: true,
    });
    var options = blessed.list({
      parent: box,
      left: 0,
      right: 0,
      shrink: true,
      bottom: 0,
      items: ['Editor', 'External', 'Cancel'],
      inputOnFocus: true,
      keys: true,
      mouse: true,
      style: {
        selected: {
          bg: 'blue',
          fg: 'white'
        }
      }
    });

    options.on('blur', ()=> {
      box.destroy();
      screen.render();
    });
   
    options.on('select', (li)=> {
      switch (li.getText()) {        
        case 'Editor':
          if (local) {
            screen.spawn(editor,[file]);
            status.focus();
            screen.render();
          } else {
            var lfp = path.resolve(`.sftpb.${file}`);
            var rfp = `${rcwd}/${file}`;

            fs.closeSync(fs.openSync(lfp,'w'));

            setStatus(`Downloading file ${file}.`);
            sftp.fastGet(rfp, lfp).then(()=>{
              setStatus(`File downloaded.`);
              screen.exec(editor,[lfp],[],()=>{
                sftp.put(lfp,rfp).then(()=>{
                  setStatus(`${file} updated!`);
                  fs.unlinkSync(lfp);
                  remote.focus();
                }).catch((err)=>{
                  fs.unlinksync(lfp);
                  setStatus(`{red-bg}${err.toString()}{/red-bg}`);
                });
              });
            }).catch((err)=>{
              //fs.unlinkSync(lfp);
              setStatus(`{red-bg}${err.toString()}: ${lfp}=>${rfp} {/red-bg}`);
              throw err;
            });

          }
          break;
        case 'External':
          spawn('open',[file]);
          break;
      }
     
      box.destroy();
      screen.render();
    });

    screen.append( box );
    options.focus();
    screen.render();
  }

  function connect( args ) {

    if ( !params || args.length > 1) {
      params = {
        host: args[1],
        port: args[2] || 22,
        username: args[3] || "" ,
        password: args[4] || ""
      };
    }

    if ( params.password.length == 0 ) {
      setStatus('Password: ');
      var pass = blessed.textbox({
        parent: screen,
        bottom: 1,
        left: 10,
        right: 0,
        height: 1,
        censor: true,
        bg: 'black',
        fg: 'white',
        inputOnFocus: true
      });
      pass.focus();
      pass.on('cancel', ()=>{
        status.focus();
        setStatus('Cancelled');
        pass.destroy();
        screen.render();
      });
      pass.on('submit', (password)=> {
        connect(["", params.host, params.port, params.username, password]);
        pass.destroy();
        screen.render();
      });
    } else {
      setStatus('Connecting...');
      sftp.connect(params)
        .then(()=>{
          rcd('.');
        }).catch((err)=>{
          setStatus(`{lightred-bg}${err.toString()}{/lightred-bg}`);
        });
    }
  }

  function rcd(to) {
    rcwd = to;
    sftp.list(to).then((data)=>{
      remoteTree = data;
      remoteTree.unshift({type: 'd', name: '.' },{type: 'd', name: '..'});
      remote.clearItems();
      for (var i in remoteTree) {
        var string = remoteTree[i].name;
        if (remoteTree[i].type == 'd') string += "/";
        remote.addItem(string);
      }
      screen.render();
      setStatus(`Connected.`);
      remote.focus();
    }).catch((err)=>{
      setStatus(`{red-bg}${err.toString()}{/red-bg}`);
    });
  }

  // Handle SFTP errors
  sftp.on('close', ()=> {
    setStatus('Disconnected.');
    rcdw = null;
    remoteTree = [];
    remote.clearItems();
    screen.render();
  });

  // Handle boot commands
  if ( process.argv.length > 2 ) {
    doColonCommand(process.argv.slice(2).join(' '));
  }
}
