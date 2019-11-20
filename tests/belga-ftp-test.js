import BelgaFTPService from '../repository/BelgaFTPService';

const user = '---';
const password = '---';
const host = 'ftp.belga.be';
let AMOUNT_OF_FILES_ON_SERVER = 0;

const belgaConfig = {
  user,
  password,
  host
};
const localTestFile = `${__dirname.replace('tests', 'repository')}/../generated-xmls/test.txt`;
const fileNameOnServer = 'test.txt';

let service = null;

describe('FTP moving file tests', () => {
  beforeEach(async () => {
    service = new BelgaFTPService(belgaConfig);
    await service.openConnection();
  });

  afterEach(async () => {
    await service.closeConnection();
    service = null;
  });

  test('Expect the current directory of the FTP-server to have 2 files.', async () => {
    expect(service).toBeDefined();
    const list = await service.listFTPServerDirectory();
    expect(list).toBeDefined();
    AMOUNT_OF_FILES_ON_SERVER = list.length;
  });

  test('Expect the test.txt file to be moved to the FTP-server.', async () => {
    expect(service).toBeDefined();
    const result = await service.moveFileToFTP(localTestFile, fileNameOnServer);
    const list = await service.listFTPServerDirectory();

    expect(list).toBeDefined();
    expect(list.length).toBe(AMOUNT_OF_FILES_ON_SERVER + 1);
    expect(result).toBeDefined();
  });

  test('Expect the test.txt file to be deleted from the FTP-server.', async () => {
    expect(service).toBeDefined();

    const deletedFile = await service.deleteFileFromServer(fileNameOnServer);
    const list = await service.listFTPServerDirectory();

    expect(deletedFile).toBeDefined();
    expect(deletedFile).toEqual(fileNameOnServer);
    expect(list).toBeDefined();
    expect(list.length).toBe(AMOUNT_OF_FILES_ON_SERVER);
  });
});
