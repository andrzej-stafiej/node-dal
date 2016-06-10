process.env.UV_THREADPOOL_SIZE = 10; // This will work
//process.env.TZ = 'Europe/Warsaw';

// setup MyError
require("./lib/my-error");

const should     = require('should'),
    async      = require('async'),
    conf       = require('./config').oracle,
    dalFactory = require('../lib/dalFactory');

describe('Data Access Layer simple test', function() {
    var dal,
        clob_1 = randomString(120000);

    before(function(done) {
        dalFactory('oracledb', conf, function(err, dalObj) {
            if(err) {
                done(err);
                return;
            }
            dal = dalObj;

            /*
            dal.querySql('DROP TABLE test_01', [], function(err) {

            });

            it('should drop test_02 table', function(done) {
                dal.querySql('DROP TABLE test_02', done);
            });

            it('should drop test_03 table', function(done) {
                dal.querySql('DROP TABLE test_03', done);
            });

            it('should drop test_01_sid sequence', function(done) {
                dal.querySql('DROP sequence test_01_sid', done);
            });
            */

            done();
        });
    });

    describe('prepare DB structure', function() {

        it('should create test_01 table', function(done) {
            dal.querySql('CREATE TABLE test_01 (id NUMBER NOT NULL, text VARCHAR2(20), CONSTRAINT test_01_pk PRIMARY KEY (id))', [], done);
        });

        it('should create test_02 table', function(done) {
            dal.querySql({ sql: 'CREATE TABLE test_02 (id NUMBER NOT NULL, text_clob CLOB, CONSTRAINT test_02_pk PRIMARY KEY (id))', cb: done});
        });

        it('should create test_03 table', function(done) {
            dal.querySql({ sql: 'CREATE TABLE test_03 (start_date DATE)', cb: done});
        });

        it('should insert 1st row to test_01', function(done) {
            dal.querySql('INSERT INTO test_01 VALUES (1, \'test1\')', [], done);
        });

        it('should insert 2nd row to test_01', function(done) {
            dal.querySql({ sql: 'INSERT INTO test_01 VALUES (2, \'test2\')', bind: [], cb: done });
        });

        it('should insert 1nd row to test_02', function(done) {
            dal.querySql({ sql: 'INSERT INTO test_02 VALUES (1, :0)', bind: [clob_1], cb: done });
        });

        it('should get col text value', function(done) {
            dal.selectOneValueSql('SELECT text FROM test_01 WHERE id=:0', [1], function(err, result) {
                should.not.exist(err);
                should.equal(result, 'test1');
                done();
            });
        });

        // to narazie nie działa czekamy na implementację od Oracle (fetchAsString dla CLOB)
        //it('should get CLOB value (fake)', function(done) {
        //    dal.selectOneValueSql('SELECT text_clob FROM test_02 WHERE id=:0', [1], function(err, result) {
        //        if(err) {
        //            done(err);
        //            return;
        //        }
        //        should.equal(result, 'test1');
        //        done();
        //    });
        //});

        it('should get CLOB value', function(done) {
            this.timeout(5000); // 5 sekund
            dal.selectClobValueSql('SELECT text_clob FROM test_02 WHERE id=:0', [1], function(err, result) {
                should.not.exist(err);
                should.equal(result.length, 120000);
                done();
            });
        });

        it('should create test_01_sid sequence', function(done) {
            dal.querySql('CREATE SEQUENCE test_01_sid ' +
                         'MINVALUE 10 MAXVALUE 9999999999 INCREMENT BY 1 ' +
                         'NOCYCLE ORDER NOCACHE', [], done);
        });
    });

    describe('modify data', function() {
        it('should insert row and return next ID (SQL version)', function(done) {
            dal.insertReturningIdSql('INSERT INTO test_01 (id, text) VALUES (:0, :1)', [null,'test10'], 'test_01_sid', function(err, result) {
                should.not.exist(err);
                should.equal(result, 10);
                done();
            });
        });

        it('should insert row and return next ID (NO SQL version)', function(done) {
            dal.insertReturningId('test_01', {id: null, text: 'test11'}, 'test_01_sid', function(err, result) {
                should.not.exist(err);
                should.equal(result, 11);
                done();
            });
        });

        it('should insert row (simple)', function(done) {
            dal.insert('test_01', {id: 999, text: 'simple'}, function(err, result) {
                should.not.exist(err);
                should.equal(result.rowsAffected, 1);
                done();
            });
        });

        it('should delete row', function(done) {
            dal.del('test_01', ['id = ?', 999], function(err, result) {
                should.not.exist(err);
                should.equal(result.rowsAffected, 1);
                done();
            });
        });

        it('should modify field in row ID = 11', function(done) {
            dal.update('test_01', {text: 'test11-modified'}, ['id = ?', 11], function(err, result) {
                should.not.exist(err);
                should.equal(result.rowsAffected, 1);
                done();
            });
        });

        it('should modify CLOB field in row ID = 1', function(done) {
            dal.update('test_02', {text_clob: 'modified CLOB'}, ['id = ?', 1], function(err, result) {
                should.not.exist(err);
                should.equal(result.rowsAffected, 1);
                done();
            });
        });

        it('should do transaction and commit', function(done) {
            dal.getDbConnection(function(err, conn) {
                should.not.exist(err);

                conn.isAutoCommit = false;

                conn.execute('INSERT INTO test_01 VALUES (:0, :1)', [123, 'AAA'], function(err) {
                    should.not.exist(err);

                    conn.execute('INSERT INTO test_01 VALUES (:0, :1)', [124, 'AAA'], function(err) {
                        should.not.exist(err);

                        conn.commit(function(err) {
                            should.not.exist(err);

                            conn.release(function(err) {
                                should.not.exist(err);

                                dal.selectOneValueSql('SELECT count(*) FROM test_01 WHERE text=:0', ['AAA'], function(err, result) {
                                    should.not.exist(err);
                                    should.equal(result, 2);
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should do transaction and rollback', function(done) {
            dal.getDbConnection(function(err, conn) {
                should.not.exist(err);

                conn.isAutoCommit = false;

                conn.execute('INSERT INTO test_01 VALUES (:0, :1)', [125, 'BBB'], function(err) {
                    should.not.exist(err);

                    conn.execute('INSERT INTO test_01 VALUES (:0, :1)', [126, 'BBB'], function(err) {
                        should.not.exist(err);

                        conn.rollback(function(err) {
                            should.not.exist(err);

                            conn.release(function(err) {
                                should.not.exist(err);

                                dal.selectOneValueSql('SELECT count(*) FROM test_01 WHERE text=:0', ['BBB'], function(err, result) {
                                    should.not.exist(err);
                                    should.equal(result, 0);
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should do transaction and commit with executeTransaction', function(done) {
            var sqlBinds = [
                ['INSERT INTO test_01 VALUES (:0, :1)', [131, 'T01']],
                ['UPDATE test_01 SET text = :0 WHERE id = :1', ['T02', 131]],
                ['UPDATE test_01 SET text = :0 WHERE id = :1', ['AAB', 124]],
                ['DELETE FROM test_01 WHERE id = :0', [131]]
            ];

            dal.executeTransaction(sqlBinds, function(err, results) {
                should.not.exist(err);
                should.equal(results.length, 4);
                done();
            });
        });

        it('should do transaction and rollback with executeTransaction', function(done) {
            var sqlBinds = [
                ['INSERT INTO test_01 VALUES (:0, :1)', [131, 'T01']],
                ['UPDATE test_01 SET text = :0 WHERE id = :1', ['AAC', 124]],
                ['UPDATE test_01_fake SET text = :0 WHERE id = :1', ['T02', 131]]
            ];

            dal.executeTransaction(sqlBinds, function(err, results) {
                (err).should.containEql({ message: 'ORA-00942: table or view does not exist'});
                done();
            });
        });

        // todo: sprawdzić czy nie ma zapisanego rekordu [131, 'T01'] bo powinien być rollback

    });

    describe('select data', function() {

        it('should get current date', function(done) {
            dal.selectOneRowSql("SELECT To_Char(sysdate, 'yyyy-mm-dd') dat FROM dual", [], function(err, result) {
                should.not.exist(err);
                should.equal(result.DAT, (new Date()).toJSON().slice(0, 10));
                done();
            });
        });

        it('should get value for ID=10', function(done) {
            dal.selectOneValueSql('SELECT text FROM test_01 WHERE id=:0', [10], function(err, result) {
                should.not.exist(err);
                should.equal(result, 'test10');
                done();
            });
        });

        it('should get row with ID=11', function(done) {
            dal.selectOneValueSql('SELECT text FROM test_01 WHERE id=:0', [11], function(err, result) {
                should.not.exist(err);
                should.equal(result, 'test11-modified');
                done();
            });
        });

        it('should get value for ID=10 (no sql)', function(done) {
            dal.selectOneValue('test_01', 'text',  ['id = ?', 10], function(err, result) {
                should.not.exist(err);
                should.equal(result, 'test10');
                done();
            });
        });

        it('should get null for ID=15', function(done) {
            dal.selectOneValueSql('SELECT text FROM test_01 WHERE id=:0', [15], function(err, result) {
                should.not.exist(err);
                should.equal(result, null);
                done();
            });
        });

        it('should get one row for ID=10', function(done) {
            dal.selectOneRow('test_01', null, ['id = ?', 10], function(err, result) {
                should.not.exist(err);
                should.deepEqual(result, { ID:10, TEXT: "test10" });
                done();
            });
        });

        it('should get all rows for test_01', function(done) {
            console.log('przed wywolaniem 1');
            dal.selectAllRows('test_01', null, [], ['id'], function(err, result) {
                should.not.exist(err);
                should.deepEqual(result, [
                    {ID: 1,   TEXT: "test1"},
                    {ID: 2,   TEXT: "test2"},
                    {ID: 10,  TEXT: "test10"},
                    {ID: 11,  TEXT: "test11-modified"},
                    {ID: 123, TEXT: "AAA"},
                    {ID: 124, TEXT: "AAB"}
                ]);
                done();
            });
        });

        it('should get all rows for test_01 (outFormat=array)', function(done) {
            dal.selectAllRows('test_01', null, [], null, {outFormat: 'array'}, function(err, result) {
                should.not.exist(err);
                should.deepEqual(result, [[1,"test1"],[2,"test2"],[10,"test10"],[11,"test11-modified"],[124,"AAB"],[123,"AAA"]]);
                done();
            });
        });

        it('should get all rows for page 1 test_01', function(done) {
            let pool = dal.getDbPool();

            console.log('pool._logStats() no 1:');
            dal.getDbPool()._logStats();

            dal.selectAllRows('test_01', null, [], ['id DESC'], {outFormat: 'array', limit: 2}, function(err, result) {
                console.log('jest w srodku');
                should.not.exist(err);
                should.deepEqual(result, [[124,"AAB",1],[123,"AAA",2]]);
                done();
            });
        });

        it('should get all rows for page 2 test_01', function(done) {
            console.log('pool._logStats() no 2:');
            dal.getDbPool()._logStats();
            dal.selectAllRows('test_01', null, [], ['id DESC'], {outFormat: 'array', limit: 2, page: 2, totalCount: true}, function(err, result) {
                should.not.exist(err);
                should.deepEqual(result, [[11,"test11-modified",3,6],[10,"test10",4,6]]);
                done();
            });
        });

        it('should get all rows for page 2 test_01', function(done) {
            dal.selectAllRows('test_01', null, [], ['id DESC'], {outFormat: 'array', limit: 2, page: 4}, function(err, result) {
                should.not.exist(err);
                should.deepEqual(result, []);
                done();
            });
        });

        it('should throw Error: Wrong number rows returned from database', function(done) {
            dal.selectOneRow('test_01', null, [], function(err) {
                should.equal(err.message, 'Wrong number rows returned from database (6)');
                done();
            });
        });


    });

    describe('insert 150 records and fetch them', function() {
        it('should delete all records from test_01', function(done) {
            dal.querySql('DELETE FROM test_01', [], done);
        });

        it('should insert 150 records', function(done) {
            var qrys = [];
            for(var i = 1; i < 151; i++) {
                qrys.push(['INSERT INTO test_01 VALUES(:0, :1)', [i, 'text_' + i]]);
            }
            dal.executeTransaction(qrys, function(err, results) {
                should.not.exist(err);

                should.equal(results.length, 150);
                done();
            });
        });

        it('should fetch 150 records', function(done) {

            dal.selectAllRows('test_01', function(err, results) {
                should.not.exist(err);
                should.equal(results.length, 150);
                done();
            });
        });
    });

    describe('create procedures', function() {
        it('should create procedure 01', function(done) {
            dal.querySql('CREATE OR REPLACE PROCEDURE test_proc_01 IS \n' +
                'BEGIN \n' +
                'dbms_lock.sleep(4); \n' +
                'END;', [], done);
        });

        it('should create procedure 02', function(done) {
            dal.querySql('CREATE OR REPLACE PROCEDURE test_proc_02 IS \n' +
                'BEGIN \n' +
                    'Dbms_Output.Put_Line(\'start\');\n' +
                    'Dbms_Output.Put_Line(\'finish\');\n' +
                'END;', [], done);
        });

        it('should create procedure 03', function(done) {
            dal.querySql('CREATE OR REPLACE PROCEDURE test_proc_03(v_in IN VARCHAR2, v_out OUT VARCHAR2) IS \n' +
                'BEGIN \n' +
                    'v_out := \'Hello \' || v_in;\n' +
                'END;', [], done);
        });

        it('should create procedure 04', function(done) {
            dal.querySql('CREATE OR REPLACE PROCEDURE test_proc_04(v_start_date IN DATE, v_info OUT VARCHAR2, v_end_date OUT DATE) IS \n' +
                'BEGIN \n' +
                    'v_info := \'Start process at: \' || To_Char(v_start_date, \'yyyy.mm.dd hh24:mi:ss\');\n' +
                    'v_end_date := v_start_date + 1;\n' +
                    'INSERT INTO test_03 VALUES (v_end_date);' +
                    'Dbms_Output.Put_Line(v_info);\n' +
                'END;', [], done);
        });
    });

    describe('run procedures', function() {
        this.timeout(15000); // 15 sekund

        //it('should run procedure that wait 4 secs', function(done) {
        //    dal.runProcedure('test_proc_01', {}, done);
        //});

        it('should run procedure and grab DBMS_OUTPUT', function(done) {
            dal.runProcedure('test_proc_02', {}, { dbmsOutput: true }, function(err, results, output) {
                should.not.exist(err);
                should.equal(output, 'start\nfinish');
                done();
            });
        });

        it('should run procedure with params', function(done) {
            var params = {
                vIn:  'Tom',
                vOut: { type: dal.STRING, dir : dal.BIND_OUT }
            };
            dal.runProcedure('test_proc_03', params, function(err, results) {
                should.not.exist(err);
                should.equal(results.vOut, 'Hello Tom');
                done();
            });
        });

        it('should run procedure with date type params with SQL cast function as IN parameter', function(done) {
            var params = {
                //vStartDate: '2015-10-23',
                vStartDate: { fn: 'To_Date(?, \'yyyymmdd\')', bind: '20151023' },
                vInfo:      { type: dal.STRING, dir : dal.BIND_OUT },
                vEndDate:   { type: dal.DATE,   dir : dal.BIND_OUT }
            };
            dal.runProcedure('test_proc_04', params, { dbmsOutput: true }, function(err, results, output) {
                should.not.exist(err);
                should.equal(results.vInfo,    'Start process at: 2015.10.23 00:00:00');
                should.equal(output,           'Start process at: 2015.10.23 00:00:00');
                should.deepEqual(results.vEndDate.toJSON(), (new Date('2015-10-24')).toJSON());
                done();
            });
        });
    });

    describe('test NLS params', function() {
        it('should NLS_DATE_FORMAT match yyyy-mm-dd on 10 concurent sessions', function(done) {
            let sql = 'SELECT value FROM nls_session_parameters WHERE parameter = :0',
                fetchNlsDateFormat = function(cnt, cb) {
                    dal.selectOneValueSql(sql, ['NLS_DATE_FORMAT'], function(err, result){
                        if(err) {
                            cb(new Error(err));
                            return;
                        }
                        should.equal(result, "yyyy-mm-dd");
                        cb();
                    });
                },
                execCnt = [0,1,2,3,4,5,6,7,8,9];
            async.map(execCnt, fetchNlsDateFormat, done);
        });
    });
    /*
    describe('drop objects - clean schema', function() {
        it('should drop test_01 table', function(done) {
            dal.querySql('DROP TABLE test_01', [], done);
        });

        it('should drop test_02 table', function(done) {
            dal.querySql('DROP TABLE test_02', done);
        });

        it('should drop test_03 table', function(done) {
            dal.querySql('DROP TABLE test_03', done);
        });

        it('should drop test_01_sid sequence', function(done) {
            dal.querySql('DROP sequence test_01_sid', done);
        });

        it('should drop procedures', function(done) {
            var procs = [
                    'test_proc_01',
                    'test_proc_02',
                    'test_proc_03'
                ],
                sqls = procs.map(function(p) { return ['DROP PROCEDURE ' + p, []]; });
            dal.executeTransaction(sqls, done);
        });
    });
    */
});

function randomString(len, charSet) {
    charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var randomString = '';
    for (var i = 0; i < len; i++) {
        var randomPoz = Math.floor(Math.random() * charSet.length);
        randomString += charSet.substring(randomPoz,randomPoz+1);
    }
    return randomString;
}